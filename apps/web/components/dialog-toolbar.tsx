"use client";

import { Search, X } from "lucide-react";

import { Pager } from "@/components/pager";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { cn } from "@workspace/ui/lib/utils";

export type ToolbarFilter<T extends string> = { value: T; label: string };

/**
 * The controls every list of cards gets: search, optional filters, paging.
 *
 * A dialog that opens with sixty cards and no way to narrow them is a wall, and
 * one that opens with five and a full toolbar is noise — so the filters are
 * optional and paging hides itself when there is a single page.
 */
export function DialogToolbar<T extends string>({
  search,
  onSearch,
  placeholder,
  searchLabel,
  filters,
  filter,
  onFilter,
  page,
  lastPage,
  onPage,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  searchLabel: string;
  filters?: readonly ToolbarFilter<T>[];
  filter?: T;
  onFilter?: (value: T) => void;
  page: number;
  lastPage: number;
  onPage: (page: number) => void;
}) {
  return (
    <>
      <InputGroup className="bg-secondary h-9 max-w-[15rem] min-w-0 flex-1 rounded-full border-transparent">
        <InputGroupAddon>
          <Search className="size-3.5" />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          placeholder={placeholder}
          aria-label={searchLabel}
          onChange={(event) => onSearch(event.target.value)}
        />
        {search && (
          <InputGroupAddon align="inline-end">
            <button onClick={() => onSearch("")} aria-label="Limpiar">
              <X className="size-3.5" />
            </button>
          </InputGroupAddon>
        )}
      </InputGroup>

      {filters && onFilter && (
        <div className="flex gap-1.5">
          {filters.map((option) => (
            <button
              key={option.value}
              onClick={() => onFilter(option.value)}
              aria-pressed={filter === option.value}
              className={cn(
                "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                filter === option.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {lastPage > 1 && <Pager page={page} lastPage={lastPage} onChange={onPage} />}
    </>
  );
}
