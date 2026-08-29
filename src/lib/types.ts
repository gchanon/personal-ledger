export type Kind = "expense" | "income";

/** A classification above categories. NULL/absent behaves as "variable". */
export type Bucket = "fixed" | "investment" | "variable";

export type Category = {
  id: string;
  name: string;
  kind: Kind;
  icon: string | null;
};

export type Wallet = {
  id: string;
  name: string;
  kind: string;
};

export type Transaction = {
  id: string;
  occurred_at: string;
  amount_minor: number;
  currency: string;
  kind: Kind;
  wallet_id: string | null;
  category_id: string | null;
  note: string | null;
};
