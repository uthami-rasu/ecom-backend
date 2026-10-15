/** Prices are stored as integer paise and exposed by the API as rupees. */
export const toPaise = (rupees: number): number => Math.round(rupees * 100);

export const toRupees = (paise: number): number => paise / 100;

export const toRupeesOrNull = (
  paise: number | null | undefined,
): number | null =>
  paise === null || paise === undefined ? null : toRupees(paise);
