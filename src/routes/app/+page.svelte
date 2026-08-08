<script lang="ts">
  import {
    connect,
    disconnect,
    controller,
    connected,
    deviceInfo,
    error,
    brightness as deviceBrightness,
    gameMode,
    macroLed,
    battery,
  } from "$lib/store";
  import type { EffectKind } from "$lib/index";
  import KeyboardVisual from "$lib/components/KeyboardVisual.svelte";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Label } from "$lib/components/ui/label";
  import { Slider } from "$lib/components/ui/slider";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import type { EffectParams } from "$lib/controller";
  import { toast } from "svelte-sonner";
  import { customSupported, ELITE_CELLS } from "$lib/keyboard/matrix";
  import { keyboardMatrixKeys } from "$lib/keyboard/layout";

  let kind = $state<EffectKind>("static");
  let color1 = $state("#00ff88");
  let color2 = $state("#0088ff");
  let speed = $state(3);
  let breathingMode = $state<"single" | "dual" | "random">("single");
  let starlightMode = $state<"single" | "dual" | "random">("single");
  let direction = $state<"left" | "right">("right");
  let brightness = $state(127);
  let paintColor = $state("#ffffff");
  let customColors = $state<Record<string, string>>({});

  // keep the slider in sync with the on-device brightness loaded on connect
  $effect(() => {
    if ($deviceBrightness != null) brightness = $deviceBrightness;
  });

  const STORE_KEY = "openkeyboard:effect";

  // restore the saved effect profile on load
  function loadProfile() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.kind !== "string") return;
      kind = s.kind;
      if (typeof s.color === "string") color1 = s.color;
      if (typeof s.color2 === "string") color2 = s.color2;
      if (typeof s.speed === "number") speed = s.speed;
      if (
        s.breathingMode === "single" ||
        s.breathingMode === "dual" ||
        s.breathingMode === "random"
      )
        breathingMode = s.breathingMode;
      if (
        s.starlightMode === "single" ||
        s.starlightMode === "dual" ||
        s.starlightMode === "random"
      )
        starlightMode = s.starlightMode;
      if (s.direction === "left" || s.direction === "right")
        direction = s.direction;
      if (typeof s.custom === "object" && s.custom !== null)
        customColors = s.custom;
    } catch {
      /* ignore corrupt storage */
    }
  }

  function saveProfile() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          kind,
          color: color1,
          color2,
          speed,
          breathingMode,
          starlightMode,
          direction,
          custom: customColors,
        }),
      );
    } catch {
      /* storage unavailable */
    }
  }

  function paintKey(code: string) {
    customColors = { ...customColors, [code]: paintColor };
  }

  function clearCustom() {
    customColors = {};
  }

  function fillCustom() {
    const next: Record<string, string> = {};
    for (const k of keyboardMatrixKeys()) next[k.code] = paintColor;
    if (isElite) for (const c of ELITE_CELLS) next[c.code] = paintColor;
    customColors = next;
  }

  if (typeof window !== "undefined") {
    loadProfile();
    $effect(() => saveProfile());
  }

  // Bumped on every effect-tile click so the auto-apply re-sends even when the
  // user re-picks the tile that's already active (otherwise Svelte sees no
  // state change and the keyboard keeps whatever the last send left).
  let applyNonce = $state(0);

  const effectParams = $derived.by<EffectParams>(() => {
    void applyNonce;
    const p: EffectParams = { kind };
    if (kind === "static" || kind === "reactive") p.color = color1;
    if (kind === "breathing") {
      p.mode = breathingMode;
      p.color = color1;
      p.color2 = color2;
    }
    if (kind === "starlight") {
      p.mode = starlightMode;
      p.color = color1;
      p.color2 = color2;
      p.speed = speed;
    }
    if (kind === "reactive") p.speed = speed;
    if (kind === "wave" || kind === "wheel") p.direction = direction;
    if (kind === "custom") p.custom = customColors;
    return p;
  });

  // Auto-apply the effect as soon as any input changes (debounced so scrubbing
  // a slider or dragging a colour picker doesn't flood the keyboard with writes).
  // Depends on $connected too, so the current effect is pushed to the keyboard
  // the moment a device is connected — not only on the next param change.
  let applyTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const p = effectParams;
    if (!$connected) return;
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => controller.apply(p).catch(() => {}), 120);
  });

  const showColor1 = $derived(
    kind === "static" ||
      kind === "reactive" ||
      kind === "breathing" ||
      kind === "starlight",
  );
  const showColor2 = $derived(
    (kind === "breathing" && breathingMode === "dual") ||
      (kind === "starlight" && starlightMode === "dual"),
  );
  const showMode = $derived(kind === "breathing" || kind === "starlight");
  const showSpeed = $derived(kind === "reactive" || kind === "starlight");
  const showDirection = $derived(kind === "wave" || kind === "wheel");
  const hasOptions = $derived(
    showMode || showColor1 || showSpeed || showDirection,
  );

  const vendor = $derived($deviceInfo?.vendor ?? "razer");
  const kbd = $derived($deviceInfo?.vendor === "razer" ? $deviceInfo.kbd : undefined);
  const lkb = $derived($deviceInfo?.vendor === "logitech" ? $deviceInfo.lkb : undefined);

  // Per-key "custom" lighting needs a standard 6-row matrix + a driver that
  // exposes a custom-frame interface. Chroma boards need matrix_custom_frame;
  // Logitech boards advertise the capability in their device spec.
  const canCustom = $derived(
    $connected
      ? vendor === "razer"
        ? !!kbd?.custom && customSupported(kbd.matrixRows, kbd.matrixCols)
        : !!lkb?.custom
      : true,
  );
  // The Huntsman Elite (9-row matrix) exposes media keys + a wrist-rest lightbar.
  const isElite = $derived(
    !!kbd && kbd.matrixRows === 9 && kbd.matrixCols === 22,
  );
  // The "Wheel" hardware effect only exists on the BlackWidow V4 family;
  // other boards fall back to spectrum, so the tile is only offered when the
  // connected device supports it (or in demo mode where the preview animates).
  const canWheel = $derived(!$connected || !!kbd?.wheel);
  const logiEffects = $derived(new Set(lkb?.effects ?? []));
  const effectList = $derived.by<Array<[EffectKind, string]>>(() => {
    const list: Array<[EffectKind, string]> = [
      ["off", "Off"],
      ["static", "Static"],
    ];
    if (vendor === "razer") {
      list.push(["wave", "Wave"]);
      if (canWheel) list.push(["wheel", "Wheel"]);
      list.push(["spectrum", "Spectrum"], ["reactive", "Reactive"], ["breathing", "Breath"], ["starlight", "Star"]);
    } else {
      if (logiEffects.has("wave")) list.push(["wave", "Wave"]);
      if (logiEffects.has("spectrum")) list.push(["spectrum", "Spectrum"]);
      if (logiEffects.has("breathing")) list.push(["breathing", "Breath"]);
    }
    if (canCustom) list.push(["custom", "Custom"]);
    return list;
  });

  // Fall back to a hardware effect if the connected board can't do the
  // selected effect (custom needs a custom-frame matrix, wheel/reactive/
  // starlight are Chroma-only or device-gated).
  $effect(() => {
    if (!$connected) return;
    if (!effectList.some(([k]) => k === kind)) kind = "static";
  });

  let gm = $state<boolean>(false);
  let ml = $state<boolean>(false);
  $effect(() => {
    if ($gameMode != null) gm = $gameMode;
  });
  $effect(() => {
    if ($macroLed != null) ml = $macroLed;
  });

  $effect(() => {
    if ($error && !$error.includes("user gesture")) toast.error($error);
  });
</script>

<svelte:head>
  <title>App — OpenKeyboard</title>
  <meta
    name="description"
    content="Control your Razer Chroma or Logitech G-series keyboard from the browser with OpenKeyboard. Apply effects, set brightness, and manage per-key lighting over WebHID."
  />
  <meta name="robots" content="noindex, nofollow" />
  <meta name="theme-color" content="#0a0c0e" />
</svelte:head>

<div class="min-h-screen w-full py-6 px-2 sm:px-3 lg:px-4">
  <div class="mx-auto flex max-w-7xl flex-col gap-6">
    <!-- Header -->
    <header class="flex items-center justify-between gap-3">
      <h1 class="flex items-center gap-2 text-lg font-bold tracking-tight">
        OpenKeyboard
        <Badge variant="secondary" class="rounded-full px-1.5 py-0 text-[10px]"
          >beta</Badge
        >
      </h1>

      <div class="flex items-center gap-2">
        {#if $connected}
          <Badge variant="default" class="gap-1.5 capitalize">
            <span class="h-1.5 w-1.5 rounded-full bg-current"></span>
            Connected
          </Badge>
          <Button variant="outline" size="sm" onclick={() => disconnect()}
            >Disconnect</Button
          >
        {:else}
          <Button variant="outline" size="sm" onclick={() => connect()}
            >Connect Keyboard</Button
          >
        {/if}
      </div>
    </header>

    {#if $connected}
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          {#if $connected && vendor === "razer"}
            <img
              src="/razer.png"
              alt="Razer"
              class="h-5 w-auto shrink-0 object-contain"
            />
          {:else if $connected && vendor === "logitech"}
            <img
              src="/logitech.png"
              alt="Logitech"
              class="h-5 w-auto shrink-0 object-contain"
            />
          {/if}
          {$deviceInfo?.name ?? "Keyboard"}

          {#if $deviceInfo?.serial}
            <span class="hidden text-xs text-muted-foreground sm:inline"
              >Serial {`${$deviceInfo.serial}`}</span
            >
          {/if}

          {#if $battery}
            <Badge variant="outline" class="gap-1.5 rounded-full text-[11px]">
              <span
                class={`h-1.5 w-1.5 rounded-full ${
                  $battery.charging ? "bg-emerald-500" : "bg-current"
                }`}
              ></span>
              {`${$battery.level}%`}
              {#if $battery.charging}
                <span class="text-muted-foreground">charging</span>
              {/if}
            </Badge>
          {/if}
        </div>
        {#if $deviceInfo?.firmware}
          <span class="text-xs text-muted-foreground"
            >Firmware {`${$deviceInfo.firmware}`}</span
          >
        {/if}
      </div>
    {:else}
      <div
        class="rounded-lg border border-border/60 bg-secondary/50 px-4 py-2.5 text-center text-sm text-muted-foreground"
      >
        Demo mode. Connect your keyboard to apply effects to real hardware.
      </div>
    {/if}

    <div class="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
      <!-- Keyboard stage -->
      <section class="flex flex-col gap-3">
        <div
          class="relative h-[340px] overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-950 via-[#0a0c0e] to-black p-4 shadow-2xl shadow-black/50 sm:p-6"
        >
          <KeyboardVisual
            preview={kind}
            layout={kbd?.layout ?? lkb?.layout ?? "full"}
            {effectParams}
            {brightness}
            custom={customColors}
            onKeyClick={kind === "custom" && canCustom ? paintKey : null}
          />
        </div>

        <div class="text-xs text-muted-foreground">
          <p>The on-screen keys mirror the chosen effect in real time.</p>
        </div>
      </section>

      <!-- Controls -->
      <aside class="flex flex-col gap-4">
        <Card class="border-border/60 bg-background/60">
          <CardHeader class="pb-2">
            <CardTitle
              class="text-xs uppercase tracking-wider text-muted-foreground"
              >Effect</CardTitle
            >
          </CardHeader>
          <CardContent class="flex flex-col gap-4">
            <div class="grid grid-cols-4 gap-1.5">
              {#each effectList as [value, label]}
                <Button
                  variant={kind === value ? "default" : "outline"}
                  size="sm"
                  class="px-1 text-xs"
                  onclick={() => {
                    kind = value;
                    applyNonce++;
                  }}
                >
                  {label}
                </Button>
              {/each}
            </div>

            {#if hasOptions}
              <Separator />
            {/if}

            {#if showMode}
              <div class="grid grid-cols-3 gap-1.5">
                {#each ["single", "dual", "random"] as m}
                  <Button
                    variant={breathingMode === m ? "default" : "outline"}
                    size="sm"
                    class="text-xs capitalize"
                    onclick={() => (breathingMode = m as typeof breathingMode)}
                  >
                    {m}
                  </Button>
                {/each}
              </div>
            {/if}

            {#if showColor1}
              <div class="grid grid-cols-2 gap-2">
                <div class="flex flex-col gap-1.5">
                  <Label class="text-xs">Color</Label>
                  <Input
                    type="color"
                    bind:value={color1}
                    class="h-9 w-full p-1"
                  />
                </div>
                {#if showColor2}
                  <div class="flex flex-col gap-1.5">
                    <Label class="text-xs">Color 2</Label>
                    <Input
                      type="color"
                      bind:value={color2}
                      class="h-9 w-full p-1"
                    />
                  </div>
                {/if}
              </div>
            {/if}

            {#if showSpeed}
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <Label class="text-xs">Speed</Label>
                  <span class="text-xs text-muted-foreground"
                    >{["", "Fast", "Medium", "Slow", "Slowest"][speed]}</span
                  >
                </div>
                <Slider
                  type="single"
                  value={speed}
                  onValueChange={(v) => (speed = v as number)}
                  min={1}
                  max={4}
                  step={1}
                />
              </div>
            {/if}

            {#if showDirection}
              <div class="grid grid-cols-2 gap-1.5">
                <Button
                  variant={direction === "left" ? "default" : "outline"}
                  size="sm"
                  onclick={() => (direction = "left")}
                >
                  ← Left
                </Button>
                <Button
                  variant={direction === "right" ? "default" : "outline"}
                  size="sm"
                  onclick={() => (direction = "right")}
                >
                  Right →
                </Button>
              </div>
            {/if}

            {#if kind === "custom" && canCustom}
              <Separator />
              <div class="flex flex-col gap-2.5">
                <div class="flex flex-col gap-1.5">
                  <Label class="text-xs">Paint colour</Label>
                  <Input
                    type="color"
                    bind:value={paintColor}
                    class="h-9 w-full p-1"
                  />
                </div>
                <div class="flex flex-wrap gap-1.5">
                  {#each [
                    "#ffffff",
                    "#ff0000",
                    "#ff8800",
                    "#ffff00",
                    "#00ff88",
                    "#00ccff",
                    "#8888ff",
                    "#ff00ff",
                  ] as sw}
                    <button
                      type="button"
                      aria-label={sw}
                      class="h-5 w-5 rounded-full border border-white/20 transition-transform hover:scale-110"
                      class:swatch-selected={paintColor === sw}
                      style="background:{sw}"
                      onclick={() => (paintColor = sw)}
                    ></button>
                  {/each}
                </div>
                <div class="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    class="flex-1 text-xs"
                    onclick={clearCustom}
                    >Clear</Button
                  >
                  <Button
                    variant="outline"
                    size="sm"
                    class="flex-1 text-xs"
                    onclick={fillCustom}
                    >Fill all</Button
                  >
                </div>
                <span
                  class="text-[10px] leading-relaxed text-muted-foreground"
                >
                  Click keys on the keyboard to paint them. Per-key lighting is
                  host-rendered and resets when the keyboard powers off.
                </span>
              </div>
            {/if}

            <Separator />

            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <Label class="text-xs">Brightness</Label>
                <span class="w-11 text-right font-mono text-xs tabular-nums"
                  >{Math.round((brightness / 255) * 100)}%</span
                >
              </div>
              <Slider
                type="single"
                value={brightness}
                onValueChange={(v) => {
                  brightness = v as number;
                  $deviceBrightness = v as number;
                  controller.setBrightness(v as number).catch(() => {});
                }}
                min={0}
                max={255}
                step={1}
              />
            </div>

            <Separator />

            <div class="flex flex-col gap-3">
              {#if $connected && vendor === "razer"}
                <span
                  class="text-xs font-medium tracking-wider text-muted-foreground uppercase"
                  >Device</span
                >

                <div class="flex items-center justify-between gap-3">
                  <div class="flex flex-col">
                    <Label class="text-xs">Game mode</Label>
                    <span class="text-[10px] text-muted-foreground"
                      >Disables the Windows key</span
                    >
                  </div>
                  <Switch
                    checked={gm}
                    onCheckedChange={(c) => {
                      gm = c;
                      $gameMode = c;
                      controller.setGameMode(c).catch(() => {});
                    }}
                  />
                </div>

                <div class="flex items-center justify-between gap-3">
                  <div class="flex flex-col">
                    <Label class="text-xs">Macro key lights</Label>
                    <span class="text-[10px] text-muted-foreground"
                      >M1-M5 backlight</span
                    >
                  </div>
                  <Switch
                    checked={ml}
                    onCheckedChange={(c) => {
                      ml = c;
                      $macroLed = c;
                      controller.setMacroLeds(c).catch(() => {});
                    }}
                  />
                </div>
              {/if}
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  </div>
</div>

<style>
  :global(:root) {
    color-scheme: dark;
  }

  .swatch-selected {
    outline: 2px solid rgba(255, 255, 255, 0.85);
    outline-offset: 2px;
  }
</style>
