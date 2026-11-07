import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { isIncomeOnlyCategory, normalizeOperationCategory } from "@contracts/operationCategories";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CategoryBadge } from "./CategoryBadge";
import { categoryTone } from "@/lib/category-colors";

export function CategoryCombobox({
  value,
  options,
  onChange,
  type,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  type: "Доход" | "Расход" | "Обмен";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const custom = query.trim().replace(/\s+/g, " ");
  const exactMatch = options.some((option) => normalizeOperationCategory(option) === normalizeOperationCategory(custom));
  const incomeOnly = type === "Расход" && isIncomeOnlyCategory(custom);
  const hint = type === "Доход" ? "Категории поступлений" : type === "Расход" ? "Категории трат" : "Категория обмена";

  const select = (category: string) => {
    onChange(category);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Категория"
          className="min-h-11 w-full justify-between bg-card px-3 font-normal hover:bg-card"
        >
          {value ? <CategoryBadge name={value} /> : <span className="text-muted-foreground">Выберите или начните вводить…</span>}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[80] w-[min(430px,calc(100vw-48px))] rounded-xl p-0">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Найти категорию текстом…"
            maxLength={160}
            className="h-11 text-base"
            autoFocus
          />
          <CommandList className="max-h-64">
            <CommandEmpty>В этом типе операций совпадений нет.</CommandEmpty>
            <CommandGroup heading={hint}>
              {options.map((option) => {
                const selected = normalizeOperationCategory(option) === normalizeOperationCategory(value);
                const tone = categoryTone(option);
                return (
                  <CommandItem key={option} value={option} onSelect={() => select(option)} className="min-h-11 gap-3 px-3">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tone.dot }} aria-hidden="true" />
                    <span className="flex-1">{option}</span>
                    {selected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {custom && !exactMatch && !incomeOnly && (
            <div className="border-t p-2">
              <button type="button" onClick={() => select(custom)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-primary transition-colors hover:bg-secondary">
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                Использовать «{custom}»
              </button>
            </div>
          )}
          {incomeOnly && <p className="border-t bg-secondary/35 px-4 py-3 text-sm text-muted-foreground">«{custom}» доступна только для дохода. Выберите другую категорию траты.</p>}
          <div className="flex items-center gap-2 border-t bg-secondary/35 px-3 py-2 text-xs text-muted-foreground">
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Можно выбрать из списка или добавить свою категорию
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
