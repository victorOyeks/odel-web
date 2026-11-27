import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Right-align numbers. */
  numeric?: boolean;
  /** Leave out of the phone card (e.g. it is already the card title). */
  hideOnCard?: boolean;
}

/**
 * Staff list tables. From 768 px a real table (caption for screen readers); below it each row becomes a card with
 * the first column as its title and the rest as label–value pairs. `rowAction` puts one button or link per row.
 */
export function DataTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  rowAction,
  footer,
}: {
  caption: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowAction?: (row: T) => ReactNode;
  footer?: ReactNode;
}) {
  const [first, ...rest] = columns;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-subtle text-label-sm text-ink-2">
            <tr>
              {columns.map((c) => (
                <th key={c.header} scope="col" className={cn("h-10 px-4 font-semibold", c.numeric && "text-right", c.className)}>
                  {c.header}
                </th>
              ))}
              {rowAction ? (
                <th scope="col" className="h-10 px-4 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="border-t border-line">
                {columns.map((c, i) => {
                  const Cell = i === 0 ? "th" : "td";
                  return (
                    <Cell key={c.header} scope={i === 0 ? "row" : undefined} className={cn("h-[52px] px-4 py-2 text-body text-ink", i === 0 && "font-normal", c.numeric && "text-right font-mono tabular-nums", c.className)}>
                      {c.cell(r)}
                    </Cell>
                  );
                })}
                {rowAction ? <td className="px-4 py-1 text-right whitespace-nowrap">{rowAction(r)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        {footer ? <div className="border-t border-line px-4 py-3">{footer}</div> : null}
      </div>
      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
            <div className="text-label-lg text-ink">{first.cell(r)}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body">
              {rest
                .filter((c) => !c.hideOnCard)
                .map((c) => (
                  <div key={c.header} className="contents">
                    <dt className="text-ink-2">{c.header}</dt>
                    <dd className="min-w-0 text-ink">{c.cell(r)}</dd>
                  </div>
                ))}
            </dl>
            {rowAction ? <div className="flex flex-wrap gap-2 pt-1">{rowAction(r)}</div> : null}
          </li>
        ))}
        {footer ? <li className="px-1">{footer}</li> : null}
      </ul>
    </>
  );
}
