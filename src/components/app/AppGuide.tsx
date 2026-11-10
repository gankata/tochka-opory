import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LAST_SEEN_VERSION_KEY,
  ONBOARDING_PENDING_KEY,
  readLocalFlag,
  removeLocalFlag,
  writeLocalFlag,
} from "@/lib/app-guide";

const steps = [
  {
    eyebrow: "Начните с малого",
    title: "Начните с того, что есть сейчас",
    description: "Укажите текущие остатки и дату начала учёта, а затем вносите новые события. Восстанавливать старые чеки не требуется.",
    details: [
      "Дата остатков — точка начала расчёта. Операции начиная с этой даты меняют баланс, а более ранние записи остаются историей для аналитики.",
      "Если прошлая история неполна, это не мешает работе. Начните с фактической суммы на сегодня — журнал, остатки и новые графики будут строиться по вашим записям.",
      "В настройках также выберите график дохода: одну или две выплаты либо поступления по факту. Тип и дни можно менять в любой момент — после сохранения перестроятся календарь и прогнозы, а внесённые операции останутся на месте.",
    ],
    points: ["Можно начать с любой даты", "Пустые разделы — не ошибка", "График дохода легко изменить позже"],
    image: "/images/guide/01-start.jpg",
    alt: "Демонстрационный главный экран с начальными остатками и основными действиями",
    links: [{ to: "/data?tab=settings", label: "Указать остатки" }, { to: "/data?tab=settings", label: "Настроить график дохода" }],
  },
  {
    eyebrow: "Деньги",
    title: "Остатки и операции",
    description: "Доходы, расходы и обмены добавляются в журнал и автоматически меняют расчётный баланс. Стартовые суммы задаются отдельно в настройках.",
    details: [
      "Для операции укажите дату, тип, категорию и сумму. Комментарий помогает найти запись позже. Будущая операция сохраняется как план и не меняет текущий остаток.",
      "Обмен одновременно уменьшает одну валюту и увеличивает другую, но не считается доходом или расходом. Банковские CSV и OFX можно импортировать с предпросмотром и откатом всего пакета.",
    ],
    points: ["Поиск по категории, валюте и комментарию", "Рублёвый эквивалент сохраняется по курсу записи", "Повторы при импорте не добавляются"],
    image: "/images/guide/02-operations.jpg",
    alt: "Демонстрационный журнал доходов, расходов и поиска операций",
    links: [{ to: "/operations", label: "Открыть операции" }, { to: "/data?tab=imports", label: "Импортировать файл" }],
  },
  {
    eyebrow: "Каждый день",
    title: "Сегодня и журнал",
    description: "На главной собраны быстрые действия, актуальные остатки и последние записи. Подробности остаются в своих разделах, чтобы экран не перегружался.",
    details: [
      "С главной можно сразу добавить операцию или записать состояние. Дополнительные блоки раскрываются отдельно, а их порядок и видимость настраиваются для текущего браузера.",
      "В журнале используйте основной поиск и фильтры типа и валюты. Выгрузка CSV сохраняет отобранные записи в файл для таблиц или резервной копии.",
    ],
    points: ["Быстрое добавление с главной", "Иностранная валюта видна при положительном остатке", "Последние события доступны без лишних расчётов"],
    image: "/images/guide/03-today.jpg",
    alt: "Демонстрационный главный экран с последними операциями и быстрыми действиями",
    links: [{ to: "/", label: "Открыть «Сегодня»" }, { to: "/operations", label: "Найти операцию" }],
  },
  {
    eyebrow: "Личное пространство",
    title: "Настроение и заметки",
    description: "Дневник помогает замечать изменения состояния, а заметки — хранить мысли, изображения, планы и вишлисты в удобном дереве страниц.",
    details: [
      "Для записи настроения достаточно даты, оценки, эмоции и темы. Сведения о сне и энергии можно добавлять, когда это полезно. Графики показывают наблюдения, но не объясняют их причины и не ставят диагнозы.",
      "В заметках доступны форматирование, вложения, шаблоны и экспорт. Связь [[название]] соединяет страницы, а локальный граф помогает увидеть их взаимосвязи. Цена в вишлисте не становится расходом автоматически.",
    ],
    points: ["Короткая запись тоже полезна", "Страницы связываются через [[название]]", "Эти разделы не меняют финансовые расчёты"],
    image: "/images/guide/04-notes.jpg",
    alt: "Демонстрационные заметки с деревом страниц и форматированным текстом",
    links: [{ to: "/mood", label: "Открыть дневник" }, { to: "/notes", label: "Открыть заметки" }],
  },
  {
    eyebrow: "Наблюдения",
    title: "Аналитика по вашим записям",
    description: "Графики и таблицы описывают только внесённые операции. Выберите период, тип и группировку, чтобы рассмотреть доходы или расходы по дням, неделям, месяцам и категориям.",
    details: [
      "Нажатие на категорию раскрывает её динамику и отдельные операции с датами, источниками и комментариями. Обмены и будущие записи не смешиваются с фактическими доходами и расходами.",
      "Сохранённое представление запоминает сочетание фильтров. Его можно применить, переименовать, обновить, откатить к сохранённому состоянию или удалить — сами операции при этом не меняются.",
    ],
    points: ["«Нет сравнения» означает пустой предыдущий период", "Неизвестные траты не оцениваются автоматически", "Прогноз — сценарий по известным событиям, а не обещание"],
    image: "/images/guide/05-analytics.jpg",
    alt: "Демонстрационная аналитика с графиками и сохранённым представлением",
    links: [{ to: "/analytics", label: "Открыть аналитику" }],
  },
  {
    eyebrow: "Когда понадобится",
    title: "План, капитал и копии",
    description: "Конверты — это месячные лимиты категорий, а не отдельные счета. План, цели и ручной учёт капитала можно подключать только тогда, когда они помогают вашим задачам.",
    details: [
      "Регулярный платёж описывает будущее обязательство и не списывает деньги сам. Цель показывает желаемый прогресс накоплений, а капитал собирает ручную оценку имущества и долгов отдельно от доступных сегодня денег.",
      "Автоматические копии помогают восстановиться после ошибки, но копия на другом носителе защищает и от поломки диска. Для переноса скачайте полный или зашифрованный архив в разделе «Данные».",
    ],
    points: ["План не блокирует деньги и не создаёт списания", "Капитал не меняет остатки по операциям", "Внешняя копия полезна даже при минимальном использовании"],
    image: "/images/guide/06-backup.jpg",
    alt: "Демонстрационный раздел данных с резервными копиями и экспортом",
    links: [{ to: "/plan", label: "Открыть план" }, { to: "/assets", label: "Открыть капитал" }, { to: "/data?tab=backups", label: "Создать копию" }],
  },
] as const;

type AppGuideProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type GuideMode = "welcome" | "guide" | "update" | null;

function initialGuideMode(manualOpen: boolean): GuideMode {
  if (manualOpen) return "guide";
  if (readLocalFlag(ONBOARDING_PENDING_KEY) === "1") return "welcome";
  const lastSeenVersion = readLocalFlag(LAST_SEEN_VERSION_KEY);
  if (lastSeenVersion && lastSeenVersion !== __APP_VERSION__) return "update";
  if (!lastSeenVersion) writeLocalFlag(LAST_SEEN_VERSION_KEY, __APP_VERSION__);
  return null;
}

export default function AppGuide({ open, onOpenChange }: AppGuideProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<GuideMode>(() => initialGuideMode(open));

  const finishOnboarding = useCallback(() => {
    removeLocalFlag(ONBOARDING_PENDING_KEY);
    writeLocalFlag(LAST_SEEN_VERSION_KEY, __APP_VERSION__);
    setMode(null);
    setStep(0);
    onOpenChange(false);
  }, [onOpenChange]);

  const closeGuide = useCallback(() => {
    if (mode === "guide" && readLocalFlag(ONBOARDING_PENDING_KEY) === "1") finishOnboarding();
    else {
      setMode(null);
      setStep(0);
      onOpenChange(false);
    }
  }, [finishOnboarding, mode, onOpenChange]);

  const closeUpdate = useCallback(() => {
    writeLocalFlag(LAST_SEEN_VERSION_KEY, __APP_VERSION__);
    setMode(null);
  }, []);

  const openFeature = (to: string) => {
    closeGuide();
    navigate(to);
  };

  const dialogOpen = mode !== null;
  const current = steps[step];

  return <Dialog open={dialogOpen} onOpenChange={(nextOpen) => {
    if (nextOpen) return;
    if (mode === "update") closeUpdate();
    else if (mode === "welcome") finishOnboarding();
    else closeGuide();
  }}>
    {mode === "welcome" ? <DialogContent className="overflow-hidden rounded-3xl p-0 sm:max-w-xl" onOpenAutoFocus={(event) => event.preventDefault()}>
      <div className="bg-secondary/55 px-6 pb-7 pt-9 sm:px-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card text-primary shadow-sm"><Sparkles className="h-6 w-6" /></div>
        <DialogHeader className="mt-6 text-left">
          <DialogTitle className="editorial text-3xl leading-tight">Ваше пространство готово</DialogTitle>
          <DialogDescription className="max-w-md text-base leading-relaxed text-foreground/80">Можно за шесть коротких шагов познакомиться с приложением или сразу начать вносить записи. Руководство всегда останется в меню.</DialogDescription>
        </DialogHeader>
      </div>
      <DialogFooter className="gap-2 p-6 sm:justify-between sm:p-7">
        <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={finishOnboarding}>Пропустить</Button>
        <Button type="button" className="min-h-12 flex-1" onClick={() => setMode("guide")}>Начать знакомство<ArrowRight className="h-4 w-4" /></Button>
      </DialogFooter>
    </DialogContent> : null}

    {mode === "guide" ? <DialogContent
      className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-3xl p-0 sm:max-w-3xl lg:max-w-5xl"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" && step < steps.length - 1) { event.preventDefault(); setStep((value) => value + 1); }
        if (event.key === "ArrowLeft" && step > 0) { event.preventDefault(); setStep((value) => value - 1); }
      }}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>Руководство по Точке опоры</DialogTitle>
        <DialogDescription>Шаг {step + 1} из {steps.length}: {current.title}</DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] md:overflow-hidden">
        <div className="order-2 flex flex-col px-6 pb-6 pt-5 sm:px-8 md:order-1 md:min-h-0 md:overflow-y-auto md:pb-7 md:pt-9">
          <div className="text-xs font-semibold uppercase tracking-[.16em] text-secondary-foreground">{current.eyebrow}</div>
          <h2 className="editorial mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{current.title}</h2>
          <p className="mt-4 text-sm leading-relaxed text-foreground/80 sm:text-base">{current.description}</p>
          <div className="mt-4 space-y-3">{current.details.map((detail) => <p key={detail} className="text-sm leading-relaxed text-muted-foreground">{detail}</p>)}</div>
          <ul className="mt-6 space-y-3">
            {current.points.map((point) => <li key={point} className="flex items-start gap-3 text-sm leading-relaxed"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="h-3.5 w-3.5" /></span>{point}</li>)}
          </ul>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap" aria-label="Перейти к функции">
            {current.links.map((link) => <Button key={link.label} type="button" variant="outline" className="min-h-11 justify-between gap-2 sm:justify-start" onClick={() => openFeature(link.to)}>{link.label}<ArrowUpRight className="h-4 w-4" /></Button>)}
          </div>
          <div className="mt-7 hidden items-center gap-2 text-xs text-foreground/80 md:flex"><BookOpen className="h-4 w-4" />Можно вернуться сюда в любой момент</div>
        </div>
        <div className="order-1 bg-secondary/55 p-4 pt-16 sm:p-6 sm:pt-16 md:order-2 md:flex md:min-h-0 md:items-start md:p-8 md:pt-16">
          <img key={current.image} src={current.image} alt={current.alt} className="guide-image aspect-[16/10] w-full rounded-xl border bg-card object-cover object-left-top shadow-sm md:sticky md:top-8" />
        </div>
      </div>
      <div className="shrink-0 border-t bg-card px-5 py-4 sm:px-7">
        <div className="mb-4 flex items-center gap-3" aria-label={`Шаг ${step + 1} из ${steps.length}`}>
          <div className="flex flex-1 gap-1.5" aria-hidden="true">{steps.map((item, index) => <span key={item.image} className={`h-1.5 flex-1 rounded-full transition-colors ${index <= step ? "bg-primary" : "bg-secondary"}`} />)}</div>
          <span className="number whitespace-nowrap text-xs text-foreground/80">{step + 1} из {steps.length}</span>
        </div>
        <DialogFooter className="flex-row items-center justify-between gap-2">
          <Button type="button" variant="ghost" className="min-h-11" aria-label="Назад" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Назад</span></Button>
          <Button type="button" variant="ghost" className="min-h-11 text-foreground/80" onClick={closeGuide}>Пропустить</Button>
          <Button type="button" className="min-h-11" onClick={() => step === steps.length - 1 ? closeGuide() : setStep((value) => value + 1)}>{step === steps.length - 1 ? "Начать пользоваться" : "Далее"}{step < steps.length - 1 ? <ArrowRight className="h-4 w-4" /> : <Check className="h-4 w-4" />}</Button>
        </DialogFooter>
      </div>
    </DialogContent> : null}

    {mode === "update" ? <DialogContent className="rounded-3xl sm:max-w-lg">
      <DialogHeader>
        <div className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-primary">Версия {__APP_VERSION__}</div>
        <DialogTitle className="editorial text-3xl">Что нового</DialogTitle>
        <DialogDescription className="pt-2 text-base leading-relaxed text-foreground/80">Ваши записи остались на месте. Теперь первый запуск и обновление требуют меньше ручной подготовки, а работа с телефона стала надёжнее.</DialogDescription>
      </DialogHeader>
      <ul className="space-y-3 text-sm leading-relaxed">
        <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Если подходящего Node.js нет, launcher скачает официальную переносимую версию и проверит её контрольную сумму.</li>
        <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />macOS и Windows сами устанавливают зависимости и пересобирают приложение после обновления.</li>
        <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Добавление операций с телефона работает по локальному HTTP даже без браузерного crypto.randomUUID.</li>
        <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Подсказки корректно закрываются в WebKit, а диаграмма расходов сбрасывает выделение после ухода указателя.</li>
      </ul>
      <DialogFooter className="mt-2 sm:justify-between">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => { closeUpdate(); onOpenChange(true); }}><BookOpen className="h-4 w-4" />Открыть руководство</Button>
        <Button type="button" className="min-h-11" onClick={closeUpdate}>Понятно</Button>
      </DialogFooter>
    </DialogContent> : null}
  </Dialog>;
}
