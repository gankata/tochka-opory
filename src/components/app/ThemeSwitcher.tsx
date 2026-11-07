import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const options = [
  { value: "system", label: "Системная", icon: Monitor },
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Тёмная", icon: Moon },
] as const;

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme = "system", resolvedTheme, setTheme } = useTheme();
  const current = options.find((option) => option.value === theme) ?? options[0];
  const Icon = theme === "system"
    ? Monitor
    : resolvedTheme === "dark"
      ? Moon
      : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-full"
            aria-label={`Тема: ${current.label}. Изменить`}
            title={`Тема: ${current.label}`}
          >
            <Icon className="h-5 w-5" />
          </Button>
        ) : (
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label={`Тема оформления: ${current.label}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">Тема оформления: {current.label.toLocaleLowerCase("ru-RU")}</span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>Тема оформления</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {options.map((option) => {
            const OptionIcon = option.icon;
            return (
              <DropdownMenuRadioItem key={option.value} value={option.value} className="min-h-10">
                <OptionIcon className="h-4 w-4" />
                {option.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
