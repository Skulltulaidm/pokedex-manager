import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DialogToolbar, type ToolbarFilter } from "./dialog-toolbar";

const FILTERS: readonly ToolbarFilter<"all" | "owned">[] = [
  { value: "all", label: "Todas" },
  { value: "owned", label: "Que tengo" },
];

/** The toolbar is controlled, so the state it drives has to exist for it to be exercised. */
function Harness({
  filters,
  lastPage = 1,
  onSearch = vi.fn(),
  onFilter = vi.fn(),
  onPage = vi.fn(),
}: {
  filters?: readonly ToolbarFilter<"all" | "owned">[];
  lastPage?: number;
  onSearch?: (value: string) => void;
  onFilter?: (value: "all" | "owned") => void;
  onPage?: (page: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "owned">("all");
  const [page, setPage] = useState(1);

  return (
    <DialogToolbar
      search={search}
      onSearch={(value) => {
        setSearch(value);
        onSearch(value);
      }}
      placeholder="Buscar carta…"
      searchLabel="Buscar carta"
      filters={filters}
      filter={filter}
      onFilter={(value) => {
        setFilter(value);
        onFilter(value);
      }}
      page={page}
      lastPage={lastPage}
      onPage={(next) => {
        setPage(next);
        onPage(next);
      }}
    />
  );
}

describe("DialogToolbar search", () => {
  it("reports what was typed", async () => {
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);

    await userEvent.type(screen.getByLabelText("Buscar carta"), "char");

    expect(onSearch).toHaveBeenLastCalledWith("char");
  });

  it("offers no way to clear an already empty box", () => {
    render(<Harness />);

    expect(screen.queryByLabelText("Limpiar")).toBeNull();
  });

  it("clears back to empty in one press", async () => {
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);
    const input = screen.getByLabelText("Buscar carta");

    await userEvent.type(input, "char");
    await userEvent.click(screen.getByLabelText("Limpiar"));

    expect(onSearch).toHaveBeenLastCalledWith("");
    expect(input).toHaveValue("");
    expect(screen.queryByLabelText("Limpiar")).toBeNull();
  });
});

describe("DialogToolbar filters", () => {
  it("shows no chips when a list has nothing to narrow by", () => {
    render(<Harness />);

    expect(screen.queryByRole("button", { name: "Todas" })).toBeNull();
  });

  it("marks the chip that is on", () => {
    render(<Harness filters={FILTERS} />);

    expect(screen.getByRole("button", { name: "Todas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Que tengo" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("moves the mark when another chip is pressed", async () => {
    const onFilter = vi.fn();
    render(<Harness filters={FILTERS} onFilter={onFilter} />);

    await userEvent.click(screen.getByRole("button", { name: "Que tengo" }));

    expect(onFilter).toHaveBeenCalledWith("owned");
    expect(screen.getByRole("button", { name: "Que tengo" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Todas" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("DialogToolbar paging", () => {
  it("hides itself when everything fits on one page", () => {
    render(<Harness lastPage={1} />);

    expect(screen.queryByLabelText("Página siguiente")).toBeNull();
  });

  it("hides itself when there is nothing to page through at all", () => {
    render(<Harness lastPage={0} />);

    expect(screen.queryByLabelText("Página siguiente")).toBeNull();
  });

  it("walks forward and stops at the ends", async () => {
    const onPage = vi.fn();
    render(<Harness lastPage={2} onPage={onPage} />);

    expect(screen.getByLabelText("Página anterior")).toBeDisabled();

    await userEvent.click(screen.getByLabelText("Página siguiente"));

    expect(onPage).toHaveBeenCalledWith(2);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Página siguiente")).toBeDisabled();
    expect(screen.getByLabelText("Página anterior")).toBeEnabled();
  });
});
