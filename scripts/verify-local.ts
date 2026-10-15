// Local-only verification against the real withholding slips in private/withholding/.
// Never runs in CI (the PDFs are gitignored). Exit code 1 on any mismatch.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  NO_EARTHQUAKE_PREMIUMS,
  NO_EXTRAS,
  NO_LIFE_PREMIUMS,
  calcIncomeTax,
  getParams,
  SUPPORTED_YEARS,
  type TaxpayerInput,
} from '../src/engine';
import { parseWithholdingSlip, type WithholdingSlipData } from '../src/import/withholding';
import { parsePayslip } from '../src/import/payslip';
import { planImport } from '../src/domain/importer';
import { seedItems } from '../src/domain/itemSeeds';
import { buildLedger } from '../src/domain/ledger';
import { computeAnnual, EMPTY_RECORDS } from '../src/domain/annual';
import type { InsuranceContract } from '../src/domain/types';
import { readPdfText } from './lib/node-pdf';

const ROOT = path.resolve(import.meta.dirname, '..');
const WITHHOLDING_DIR = path.join(ROOT, 'private', 'withholding');
const PAYSLIP_DIR = path.join(ROOT, 'private', 'payslips');

interface Check {
  label: string;
  expected: number;
  actual: number;
}

function toTaxpayer(slip: WithholdingSlipData): TaxpayerInput {
  const params = getParams(slip.year);
  const perPerson = params.incomeTax.fixedTaxReduction?.value.perPerson;
  return {
    year: slip.year,
    salary: slip.paymentAmount,
    socialInsurance: slip.socialInsurance,
    smallBusinessMutualAid: 0,
    lifeInsurance: slip.lifeInsurancePremiums ?? NO_LIFE_PREMIUMS,
    earthquakeInsurance: NO_EARTHQUAKE_PREMIUMS,
    family: [],
    housingLoanCredit: slip.housingLoanCredit,
    housingLoanCreditResident: 0,
    selfIsSpeciallyDisabled: false,
    fixedTaxReductionPersons:
      perPerson && slip.fixedTaxReductionApplied !== null
        ? Math.ceil(slip.fixedTaxReductionApplied / perPerson)
        : undefined,
  };
}

export async function verifyWithholdingSlips(): Promise<boolean> {
  const files = (await readdir(WITHHOLDING_DIR))
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort();
  let ok = true;
  for (const file of files) {
    const slip = parseWithholdingSlip(await readPdfText(path.join(WITHHOLDING_DIR, file)));
    if (!SUPPORTED_YEARS.includes(slip.year)) {
      console.log(`- ${file}: ${slip.year}年分は税制パラメータ対象外のためスキップ`);
      continue;
    }
    if (slip.earthquakeInsuranceDeduction > 0) {
      throw new Error(
        `${file}: 地震保険料控除の保険料内訳が源泉徴収票にないため、検証入力を拡張してください`,
      );
    }
    const result = calcIncomeTax(
      getParams(slip.year),
      toTaxpayer(slip),
      'yearEnd',
      NO_EXTRAS,
    ).value;
    const checks: Check[] = [
      {
        label: '給与所得控除後の金額',
        expected: slip.employmentIncome,
        actual: result.income.totalIncome,
      },
      {
        label: '生命保険料の控除額',
        expected: slip.lifeInsuranceDeduction,
        actual: result.deductions.lifeInsurance,
      },
      {
        label: '所得控除の額の合計額',
        expected: slip.totalDeductions,
        actual: result.deductions.total,
      },
      { label: '源泉徴収税額', expected: slip.withheldTax, actual: result.annualTax },
    ];
    if (slip.basicDeduction !== null && slip.basicDeduction > 0) {
      checks.push({
        label: '基礎控除の額',
        expected: slip.basicDeduction,
        actual: result.deductions.basic,
      });
    }
    const failed = checks.filter((c) => c.expected !== c.actual);
    ok &&= failed.length === 0;
    console.log(`${failed.length === 0 ? '✓' : '✗'} ${file}（${slip.year}年分）`);
    for (const c of checks) {
      const mark = c.expected === c.actual ? '  ok' : '  NG';
      console.log(
        `${mark} ${c.label}: 票 ${c.expected.toLocaleString()} / 計算 ${c.actual.toLocaleString()}`,
      );
    }
  }
  return ok;
}

async function readSlips(): Promise<WithholdingSlipData[]> {
  const files = (await readdir(WITHHOLDING_DIR)).filter((f) => f.toLowerCase().endsWith('.pdf'));
  const slips = await Promise.all(
    files.map(async (f) => parseWithholdingSlip(await readPdfText(path.join(WITHHOLDING_DIR, f)))),
  );
  return slips.filter((s) => SUPPORTED_YEARS.includes(s.year));
}

function contractsFrom(slips: readonly WithholdingSlipData[]): InsuranceContract[] {
  const kinds = [
    ['generalNew', 'generalLife', false],
    ['generalOld', 'generalLife', true],
    ['careMedical', 'careMedical', false],
    ['pensionNew', 'pension', false],
    ['pensionOld', 'pension', true],
  ] as const;
  return kinds.map(([field, kind, isOld]) => ({
    id: field,
    kind,
    isOld,
    company: '源泉徴収票の内訳',
    premiumByYear: Object.fromEntries(
      slips.map((s) => [String(s.year), s.lifeInsurancePremiums?.[field] ?? 0]),
    ),
    certificateReceivedOn: {},
    submittedForYearEnd: {},
  }));
}

/** Bulk-imports every payslip and checks the annual pipeline against the withholding slips. */
async function verifyPayslips(): Promise<boolean> {
  const parsed = [];
  for (const year of (await readdir(PAYSLIP_DIR)).sort()) {
    for (const file of (await readdir(path.join(PAYSLIP_DIR, year))).sort()) {
      parsed.push({
        fileName: file,
        slip: parsePayslip(await readPdfText(path.join(PAYSLIP_DIR, year, file))),
      });
    }
  }
  let seq = 0;
  const plan = planImport(
    parsed,
    seedItems(),
    [],
    [],
    () => `id-${++seq}`,
    new Date().toISOString(),
  );
  const rejected = plan.slips.filter((s) => !s.ok);
  console.log(
    `明細 ${plan.slips.length}件：検算・累計照合 OK ${plan.slips.length - rejected.length}件 / NG ${rejected.length}件`,
  );
  for (const r of rejected) {
    const failed = r.checks.filter((c) => !c.ok).map((c) => c.name);
    console.log(`  NG ${r.fileName}: ${[...failed, ...r.cumulativeIssues].join('; ')}`);
  }
  if (plan.newItems.length > 0) {
    console.log(`  分類待ちの新項目: ${plan.newItems.map((i) => i.name).join('、')}`);
  }
  const items = [...seedItems(), ...plan.newItems];
  const ok = plan.slips.filter((s) => s.ok);
  const ledger = buildLedger(
    items,
    ok.map((s) => s.payslip),
    ok.flatMap((s) => s.lines),
  );
  const slips = await readSlips();
  const records = { ...EMPTY_RECORDS, insurance: contractsFrom(slips) };
  let allOk = rejected.length === 0;
  console.log('== 明細の年間集計 × 源泉徴収票 ==');
  for (const slip of slips) {
    const annual = computeAnnual(ledger, slip.year, records);
    const yearEndActual = annual.totals.yearEndAdjustment;
    const checks: Check[] = [
      {
        label: '支払金額（課税支給の年合計）',
        expected: slip.paymentAmount,
        actual: annual.totals.taxablePay,
      },
      {
        label: '社会保険料等の金額',
        expected: slip.socialInsurance,
        actual: annual.totals.socialInsurance,
      },
      {
        label: '源泉徴収税額',
        expected: slip.withheldTax,
        actual: annual.estimate.yearEnd.annualTax,
      },
      {
        label: '年調過不足額（12月明細）',
        expected: yearEndActual,
        actual: annual.estimate.yearEndBalance,
      },
    ];
    const failed = checks.filter((c) => c.expected !== c.actual);
    allOk &&= failed.length === 0 && !annual.hasForecast;
    console.log(
      `${failed.length === 0 ? '✓' : '✗'} ${slip.year}年分（予測を含む: ${annual.hasForecast ? 'あり' : 'なし'}）`,
    );
    for (const c of checks) {
      const mark = c.expected === c.actual ? '  ok' : '  NG';
      console.log(
        `${mark} ${c.label}: 票/明細 ${c.expected.toLocaleString()} / 計算 ${c.actual.toLocaleString()}`,
      );
    }
  }
  const latest = Math.max(...SUPPORTED_YEARS);
  const current = computeAnnual(ledger, latest, records);
  console.log(
    `参考 ${latest}年分（予測 給与${current.totals.forecastSalaryMonths}か月・賞与${current.totals.forecastBonusCount}回）: ` +
      `課税支給 ${current.totals.taxablePay.toLocaleString()} / 年税額 ${current.estimate.yearEnd.annualTax.toLocaleString()} / ` +
      `年調過不足 ${current.estimate.yearEndBalance.toLocaleString()} / ふるさと上限 ${current.estimate.furusato.withoutMedical.limit.toLocaleString()}` +
      `（${latest}年分の生命保険料は前年の内訳を仮置きしていないため 0）`,
  );
  return allOk;
}

async function main(): Promise<void> {
  console.log('== 源泉徴収票 × 計算エンジン ==');
  const slipsOk = await verifyWithholdingSlips();
  const payslipsOk = await verifyPayslips();
  if (!slipsOk || !payslipsOk) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
