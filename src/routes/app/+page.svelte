<script lang="ts">
  import {
    connect,
    disconnect,
    controller,
    connected,
    deviceInfo,
    error,
    brightness as deviceBrightness,
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
  import type { EffectParams } from "$lib/controller";
  import { toast } from "svelte-sonner";

  let kind = $state<EffectKind>("static");
  let color1 = $state("#00ff88");
  let color2 = $state("#0088ff");
  let speed = $state(3);
  let breathingMode = $state<"single" | "dual" | "random">("single");
  let starlightMode = $state<"single" | "dual" | "random">("single");
  let direction = $state<"left" | "right">("right");
  let brightness = $state(127);

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
        }),
      );
    } catch {
      /* storage unavailable */
    }
  }

  if (typeof window !== "undefined") {
    loadProfile();
    $effect(() => saveProfile());
  }

  const effectParams = $derived.by<EffectParams>(() => {
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
    if (kind === "wave") p.direction = direction;
    return p;
  });

  // Auto-apply the effect as soon as any input changes (debounced so scrubbing
  // a slider or dragging a colour picker doesn't flood the keyboard with writes).
  let applyTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const p = effectParams;
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
  const showDirection = $derived(kind === "wave");
  const hasOptions = $derived(
    showMode || showColor1 || showSpeed || showDirection,
  );

  const effectList: Array<[EffectKind, string]> = [
    ["off", "Off"],
    ["static", "Static"],
    ["wave", "Wave"],
    ["spectrum", "Spectrum"],
    ["reactive", "Reactive"],
    ["breathing", "Breath"],
    ["starlight", "Star"],
  ];

  $effect(() => {
    if ($error && !$error.includes("user gesture")) toast.error($error);
  });
</script>

<svelte:head>
  <title>OpenKeyboard</title>
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
          {$deviceInfo?.name ?? "Keyboard"}

          {#if $deviceInfo?.serial}
            <span class="hidden text-xs text-muted-foreground sm:inline"
              >Serial {`${$deviceInfo.serial}`}</span
            >
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
            layout={$deviceInfo?.kbd?.layout ?? "full"}
            {effectParams}
            {brightness}
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
                  onclick={() => (kind = value)}
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
</style>
