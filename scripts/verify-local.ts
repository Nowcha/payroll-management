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
import { readPdfText } from './lib/node-pdf';

const ROOT = path.resolve(import.meta.dirname, '..');
const WITHHOLDING_DIR = path.join(ROOT, 'private', 'withholding');

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

async function main(): Promise<void> {
  console.log('== 源泉徴収票 × 計算エンジン ==');
  const slipsOk = await verifyWithholdingSlips();
  if (!slipsOk) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
