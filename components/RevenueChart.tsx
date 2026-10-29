"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type RevenuePoint = { month: string; payments: number; invoices: number; quotes: number };

// Hex colors read on both the light and dark themes; the tooltip follows the theme through CSS variables.
const TICK = { fontSize: 10.5, fill: "#8c867f", fontFamily: "var(--font-mono)" };
const TIP = { background: "var(--color-white)", border: "1px solid var(--color-line)", borderRadius: 10, fontSize: 13, color: "var(--color-gray-900)" };

const usd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#8c867f" strokeOpacity={0.18} vertical={false} />
          <XAxis dataKey="month" tick={TICK} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={usd} tick={TICK} axisLine={false} tickLine={false} width={64} />
          <Tooltip formatter={(v) => usd(Number(v))} contentStyle={TIP} labelStyle={{ color: "var(--color-gray-900)" }} cursor={{ stroke: "#8c867f", strokeOpacity: 0.4 }} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
          <Line type="monotone" dataKey="payments" name="Payments" stroke="#fb7000" strokeWidth={2.4} dot={false} activeDot={{ r: 4.5 }} />
          <Line type="monotone" dataKey="invoices" name="Invoices" stroke="#b07a4f" strokeWidth={1.8} dot={false} />
          <Line type="monotone" dataKey="quotes" name="Quotes" stroke="#8c9499" strokeWidth={1.8} strokeDasharray="3 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
