// Default item master (requirements 6.2 table + items found in the 2024-2026 slips).
// Payment items are all taxable: their sum equals 支払金額 on the 2024/2025 withholding slips.
import type { ForecastMethod, InsuranceBase, ItemBlock, ItemMaster, TaxCategory } from './types';

type Seed = [name: string, block: ItemBlock, category: TaxCategory, method: ForecastMethod];

const SEEDS: Seed[] = [
  ['基本給', 'payment', 'taxablePay', 'recent'],
  ['基本給調整', 'payment', 'taxablePay', 'none'],
  ['住宅手当', 'payment', 'taxablePay', 'recent'],
  ['前払退職金', 'payment', 'taxablePay', 'recent'],
  ['時間外勤務手当', 'payment', 'taxablePay', 'avg3'],
  ['深夜手当', 'payment', 'taxablePay', 'avg3'],
  ['特別支給', 'payment', 'taxablePay', 'none'],
  ['その他支給', 'payment', 'taxablePay', 'none'],
  ['賞与基本給', 'payment', 'taxablePay', 'lastYear'],
  ['通勤手当', 'payment', 'nonTaxablePay', 'recent'],
  ['健康保険', 'deduction', 'socialInsurance', 'recent'],
  ['介護保険', 'deduction', 'socialInsurance', 'recent'],
  ['厚生年金', 'deduction', 'socialInsurance', 'recent'],
  ['雇用保険', 'deduction', 'socialInsurance', 'avg3'],
  ['子育て支援金', 'deduction', 'socialInsurance', 'recent'],
  ['所得税', 'deduction', 'incomeTax', 'recent'],
  ['年調過不足額', 'deduction', 'yearEndAdjustment', 'none'],
  ['住民税', 'deduction', 'residentTax', 'recent'],
  ['定額減税額', 'deduction', 'fixedTaxReduction', 'none'],
  ['生命保険', 'deduction', 'otherDeduction', 'recent'],
  ['株式購入', 'deduction', 'otherDeduction', 'avg3'],
  ['その他控除', 'deduction', 'otherDeduction', 'none'],
  ['レインバース', 'deduction', 'otherDeduction', 'none'],
];

/** Social insurance items levied on a standard remuneration (name → base). */
export const INSURANCE_BASE_BY_NAME: Record<string, InsuranceBase> = {
  健康保険: 'health',
  介護保険: 'nursing',
  厚生年金: 'pension',
  子育て支援金: 'childSupport',
};

/**
 * Payments that are not 報酬 for the standard remuneration. 特別支給 is offset by the same amount
 * in その他控除 (stock-related); excluding it reproduces the October 2024 grade on the real slips.
 */
export const EXCLUDED_FROM_REMUNERATION = new Set(['特別支給', 'その他支給']);

export function isExcludedFromRemuneration(item: ItemMaster): boolean {
  return item.excludeFromRemuneration ?? EXCLUDED_FROM_REMUNERATION.has(item.name);
}

export function insuranceBaseOf(item: ItemMaster): InsuranceBase | undefined {
  return item.insuranceBase ?? INSURANCE_BASE_BY_NAME[item.name];
}

export function seedItems(): ItemMaster[] {
  return SEEDS.map(([name, block, category, defaultMethod], i) => ({
    id: `item-${i + 1}`,
    name,
    aliases: [],
    ...(INSURANCE_BASE_BY_NAME[name] ? { insuranceBase: INSURANCE_BASE_BY_NAME[name] } : {}),
    ...(EXCLUDED_FROM_REMUNERATION.has(name) ? { excludeFromRemuneration: true } : {}),
    block,
    category,
    defaultMethod,
    order: (i + 1) * 10,
  }));
}

export function isPayCategory(category: TaxCategory): boolean {
  return category === 'taxablePay' || category === 'nonTaxablePay';
}
