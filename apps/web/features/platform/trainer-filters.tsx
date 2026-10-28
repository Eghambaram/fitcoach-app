"use client";

import { WORKSPACE_STATUSES } from "@fitcoach/shared";
import { useEffect, useState } from "react";
import { FilterBar } from "@/components/shared/data-list";
import { Select } from "@/components/ui/input";
import { useUrlQuery } from "@/lib/use-url-query";
import { WORKSPACE_STATUS } from "./format";

/** Search, status and sort for the trainers list, kept in the URL. */
export function TrainerFilters() {
  const { params, update } = useUrlQuery();
  const [search, setSearch] = useState(params.get("q") ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get("q") ?? "") !== search) update({ q: search });
    }, 300);
    return () => clearTimeout(timer);
    // `update` reads the newest URL itself; re-run only when the typed text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <FilterBar
      search={search}
      onSearchChange={setSearch}
      searchLabel="Search name, business or email"
    >
      <Select
        aria-label="Status"
        value={params.get("status") ?? ""}
        onChange={(event) => update({ status: event.target.value })}
        className="sm:w-48"
      >
        <option value="">All statuses</option>
        {WORKSPACE_STATUSES.map((status) => (
          <option key={status} value={status}>
            {WORKSPACE_STATUS[status].label}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Sort"
        value={params.get("sort") ?? "newest"}
        onChange={(event) =>
          update({ sort: event.target.value === "newest" ? null : event.target.value })
        }
        className="sm:w-48"
      >
        <option value="newest">Newest signup</option>
        <option value="oldest">Oldest signup</option>
        <option value="last_active">Last active</option>
      </Select>
    </FilterBar>
  );
}
