<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { KEYBOARD_DEVICES } from '$lib/razer/devices';
	import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs';
	import { connect, controller } from '$lib/store';
	import { goto } from '$app/navigation';

	async function startConnect() {
		await connect();
		if (controller.connected) goto('/app');
	}

	const linuxSetupCommands = `sudo tee /etc/udev/rules.d/55-openkeyboard.rules <<'EOF'
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1532", MODE="0666", TAG+="uaccess"
EOF
sudo udevadm control --reload-rules
sudo udevadm trigger`;

	let copied = $state(false);

	async function copyLinuxCommands() {
		try {
			await navigator.clipboard.writeText(linuxSetupCommands);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* clipboard unavailable */
		}
	}

	const family = (name: string): string => {
		if (name.startsWith('BlackWidow')) return 'BlackWidow';
		if (name.startsWith('Huntsman')) return 'Huntsman';
		if (name.startsWith('DeathStalker')) return 'DeathStalker';
		return 'Other';
	};

	const familyOrder = ['BlackWidow', 'Huntsman', 'DeathStalker', 'Other'];
	const razerGroups = familyOrder
		.map((label) => ({
			label,
			items: KEYBOARD_DEVICES.filter((d) => family(d.name) === label)
		}))
		.filter((g) => g.items.length > 0);

	// Supported categories. Only Razer is wired up today; future brands can
	// add their own entry with a resolved groups array.
	const categories = [
		{
			id: 'razer',
			label: 'Razer',
			groups: razerGroups
		}
	];

	let activeCategory = $state(categories[0].id);
	const activeGroup = $derived(categories.find((c) => c.id === activeCategory)!.groups);
	const deviceCount = $derived(activeGroup.reduce((n, g) => n + g.items.length, 0));

	const features = [
		{
			title: 'Hardware effects',
			description: 'Static, wave, spectrum, reactive, breathing and starlight, rendered by the keyboard itself.'
		},
		{
			title: 'No install',
			description: 'Runs in Chromium browsers over WebHID. No drivers, no Synapse, nothing to download.'
		},
		{
			title: 'Privacy first',
			description: 'Everything stays on your machine and your keyboard. No telemetry no tracking.'
		}
	];
</script>

<svelte:head>
	<title>OpenKeyboard, keyboard lighting in your browser</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-background">
	<!-- Header -->
	<header class="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
		<div class="mx-auto flex w-full max-w-6xl items-center justify-between py-3">
			<a href="/" class="flex items-center gap-2 font-semibold">
				OpenKeyboard
				<Badge variant="secondary" class="rounded-full px-1.5 py-0 text-[10px]">beta</Badge>
			</a>
			<div class="flex items-center gap-3">
				<Button href="#troubleshooting" variant="ghost" size="sm">Troubleshooting</Button>
				<Button variant="outline" size="sm" onclick={startConnect}>Connect Keyboard</Button>
			</div>
		</div>
	</header>

	<main class="flex-1">
		<!-- Hero -->
		<section class="mx-auto w-full max-w-4xl px-4 pt-16 pb-12 text-center sm:pt-24">
			<h1 class="mt-6 text-4xl font-bold tracking-tight text-balance sm:text-6xl">OpenKeyboard</h1>

			<p class="mx-auto mt-4 max-w-1xl text-base text-muted-foreground text-pretty sm:text-lg">
				A free, open-source WebHID app that controls your keyboard without any proprietary software.<br />Connect your keyboard, change its settings, and close the web app when you're done.
			</p>

			<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
				<Button size="lg" onclick={startConnect}>Connect Keyboard</Button>
				<Button href="#supported" variant="outline" size="lg">Supported keyboards</Button>
			</div>
		</section>

		<!-- Features -->
		<section class="mx-auto w-full max-w-4xl px-4 pb-16">
			<div class="grid gap-4 sm:grid-cols-3">
				{#each features as f}
					<Card class="border-border/60 bg-card">
						<CardHeader class="pb-2">
							<CardTitle class="text-sm">{f.title}</CardTitle>
						</CardHeader>
						<CardContent>
							<p class="text-xs leading-relaxed text-muted-foreground">
								{f.description}
							</p>
						</CardContent>
					</Card>
				{/each}
			</div>
		</section>

		<!-- Supported keyboards -->
		<section id="supported" class="border-t border-border/60 bg-secondary/40">
			<div class="mx-auto w-full max-w-5xl px-4 py-16">
				<div class="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
					<div>
						<h2 class="text-2xl font-bold tracking-tight">Supported keyboards</h2>
						<p class="mt-2 max-w-xl text-sm text-muted-foreground">
							{deviceCount} Razer Chroma keyboards supported.
						</p>
					</div>
					<Badge variant="secondary" class="rounded-full">
						{deviceCount} devices
					</Badge>
				</div>

				<Tabs bind:value={activeCategory} class="mt-8">
					<TabsList>
						{#each categories as cat}
							<TabsTrigger value={cat.id}>{cat.label}</TabsTrigger>
						{/each}
					</TabsList>

					{#each categories as cat}
						<TabsContent value={cat.id}>
							{#each cat.groups as group}
								<div class="mt-10">
									<div class="flex items-center gap-2">
										<h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
											{group.label}
										</h3>
										<span class="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{group.items.length}</span>
									</div>
									<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
										{#each group.items as d}
											<div class="flex h-[180px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-colors hover:border-border">
												<div class="min-h-0 flex-1 bg-secondary/50">
													{#if d.image}
														<img src={d.image} alt={d.name} loading="lazy" class="h-full w-full object-contain p-1" />
													{:else}
														<div class="flex h-full w-full items-center justify-center text-3xl text-muted-foreground/30"></div>
													{/if}
												</div>
												<div class="shrink-0 truncate border-t border-border/60 px-4 py-2.5 text-sm font-medium">
													{d.name}
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/each}
						</TabsContent>
					{/each}
				</Tabs>
			</div>
		</section>

		<!-- Troubleshooting -->
		<section id="troubleshooting" class="border-t border-border/60 bg-secondary/40">
			<div class="mx-auto w-full max-w-4xl px-4 py-16">
				<h2 class="text-2xl font-bold tracking-tight">Troubleshooting</h2>
				<p class="mt-2 max-w-2xl text-sm text-muted-foreground">Why WebHID may not control your lighting on Linux.</p>

				<div class="mt-8 rounded-xl border border-border/60 bg-card p-6">
					<h3 class="text-sm font-semibold">Linux needs a one-time permission fix</h3>
					<p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
						Browsers talk to your keyboard through the WebHID API, which on Linux is guarded by the OS.<br />By default your keyboard is only readable, not writable, so the app connects
						but the lighting controls do nothing until a small udev rule grants access.
					</p>
					<p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
						If "Connect Keyboard" looks like it worked but nothing changes, run these three lines in a terminal, then unplug and replug your keyboard (or reboot):
					</p>
					<div class="relative mt-4">
						<button
							type="button"
							class="absolute right-1.5 top-1.5 z-10 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-200 transition hover:bg-amber-500/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300"
							onclick={copyLinuxCommands}
						>
							{copied ? 'Copied!' : 'Copy'}
						</button>
						<pre class="overflow-x-auto rounded-lg border border-border/60 bg-background px-4 py-3 font-mono text-xs leading-relaxed text-amber-100">{linuxSetupCommands}</pre>
					</div>
					<a
						href="https://developer.chrome.com/docs/capabilities/hid#:~:text=On%20most%20Linux%20systems%2C%20HID%20devices%20are%20mapped%20with%20read%2Donly%20permissions%20by%20default.%20To%20allow%20Chrome%20to%20open%20an%20HID%20device%2C%20you%20will%20need%20to%20add%20a%20new%20udev%20rule.%20Create%20a%20file%20at%20/etc/udev/rules.d/50%2Dyourdevicename.rules%20with%20the%20following%20content%3A"
						target="_blank"
						rel="noopener noreferrer"
						class="mt-4 inline-flex items-center gap-1 rounded bg-amber-500/20 px-2.5 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300"
					>
						Read on Chrome Docs
					</a>
				</div>
			</div>
		</section>
	</main>

	<footer class="border-t border-border/60">
		<div class="mx-auto flex w-full max-w-6xl items-center justify-between py-6 text-xs text-muted-foreground">
			<span>OpenKeyboard - {new Date().getFullYear()}</span>

			<div class="flex items-center gap-3">
				<Button variant="link" size="sm" class="px-0" target="_blank" href="https://github.com/ge0rg3e/openkeyboard">GitHub</Button>

				<Button variant="link" size="sm" class="px-0" target="_blank" href="https://x.com/ge0rg3e_dev">Follow @ge0rg3e_dev on X</Button>
			</div>
		</div>
	</footer>
</div>
