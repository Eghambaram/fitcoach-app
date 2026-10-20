import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "../ui/input";

export interface DataColumn<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Hide on the mobile card layout (secondary detail). */
  desktopOnly?: boolean;
  className?: string;
}

/**
 * DataTable on desktop ↔ CardList on mobile (§7.2) from one column definition, so both widths show
 * the same data. Empty/loading/error states are the caller's (render EmptyState instead of rows).
 */
export function DataList<Row>({
  rows,
  columns,
  rowKey,
  caption,
  cardTitle,
}: {
  rows: Row[];
  columns: DataColumn<Row>[];
  rowKey: (row: Row) => string;
  /** Accessible name for the table. */
  caption: string;
  /** The headline of each mobile card (usually the person). */
  cardTitle: (row: Row) => ReactNode;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-card border border-border bg-card md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn("px-4 py-3 font-medium", column.className)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={cn("px-4 py-3", column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-card border border-border bg-card p-4">
            <div className="font-semibold">{cardTitle(row)}</div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {columns
                .filter((column) => !column.desktopOnly)
                .map((column) => (
                  <div key={column.key} className="contents">
                    <dt className="text-muted-foreground">{column.header}</dt>
                    <dd className="min-w-0">{column.cell(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export interface FilterTab {
  value: string;
  label: string;
  count?: number;
}

/** Search + selects + tabs with counts (§7.2). Counts come from the API, never estimated. */
export function FilterBar({
  search,
  onSearchChange,
  searchLabel,
  tabs,
  activeTab,
  onTabChange,
  children,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchLabel?: string;
  tabs?: FilterTab[];
  activeTab?: string;
  onTabChange?: (value: string) => void;
  /** Extra filters (selects). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {tabs ? (
        <div
          role="tablist"
          aria-label="Filter"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        >
          {tabs.map((tab) => {
            const active = tab.value === activeTab;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange?.(tab.value)}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap",
                  active ? "bg-charcoal text-white" : "text-foreground hover:bg-muted",
                )}
              >
                {tab.label}
                {tab.count !== undefined ? (
                  <span
                    className={cn("rounded-full px-2 text-xs", active ? "bg-white/20" : "bg-muted")}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {onSearchChange || children ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {onSearchChange ? (
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search ?? ""}
                onChange={(event) => onSearchChange(event.target.value)}
                aria-label={searchLabel ?? "Search"}
                placeholder={searchLabel ?? "Search"}
                className="pl-9"
              />
            </div>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
