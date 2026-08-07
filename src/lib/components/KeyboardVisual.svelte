<script lang="ts">
	import { onMount } from 'svelte';
	import { keyboardMatrixKeys } from '$lib/keyboard/layout';
	import { effectColorOf, type PreviewState } from '$lib/preview';
	import type { EffectKind, EffectParams } from '$lib/controller';
	import type { LayoutKind } from '$lib/razer/devices';

	let {
		preview = null as EffectKind | null,
		layout = 'full' as LayoutKind,
		effectParams = {} as EffectParams,
		brightness = 255 as number,
		custom = {} as Record<string, string>,
		onKeyClick = null as ((code: string) => void) | null
	}: {
		preview?: EffectKind | null;
		layout?: LayoutKind;
		effectParams?: EffectParams;
		brightness?: number;
		custom?: Record<string, string>;
		onKeyClick?: ((code: string) => void) | null;
	} = $props();

	// Which extra blocks this model exposes. 'full' has a function row + numpad,
	// 'tkl' keeps the function row but drops the numpad, and compact styles show
	// nothing extra (the relabeled 60% typing block below).
	const showFnRow = $derived(layout === 'full' || layout === 'tkl');
	const showNumpad = $derived(layout === 'full');

	const allKeys = keyboardMatrixKeys();
	const keyByCode = new Map(allKeys.map((k) => [k.code, k]));
	const clock: PreviewState = $state({
		minCol: Math.min(...allKeys.map((k) => k.col)),
		maxCol: Math.max(...allKeys.map((k) => k.col)),
		time: 0
	});

	// keys physically pressed on the real board, shown in real time
	const pressed: Record<string, number> = $state({});

	let raf = 0;
	let alive = true;

	// map browser KeyboardEvent.code -> matrix key code
	const CODE_MAP: Record<string, string> = {
		Escape: 'ESC',
		Backquote: 'GRAVE',
		Minus: 'MINUS',
		Equal: 'EQUAL',
		Backspace: 'BACKSPACE',
		Tab: 'TAB',
		BracketLeft: 'LBRACKET',
		BracketRight: 'RBRACKET',
		Backslash: 'BACKSLASH',
		Semicolon: 'SEMICOLON',
		Quote: 'APOSTROPHE',
		Enter: 'ENTER',
		ShiftLeft: 'LSHIFT',
		ShiftRight: 'RSHIFT',
		Comma: 'COMMA',
		Period: 'PERIOD',
		Slash: 'SLASH',
		ControlLeft: 'LCTRL',
		ControlRight: 'RCTRL',
		AltLeft: 'LALT',
		AltRight: 'RALT',
		MetaLeft: 'LSUPER',
		Space: 'SPACE',
		CapsLock: 'CAPS',
		ArrowUp: 'UP',
		ArrowDown: 'DOWN',
		ArrowLeft: 'LEFT',
		ArrowRight: 'RIGHT',
		Home: 'HOME',
		End: 'END',
		PageUp: 'PGUP',
		PageDown: 'PGDN',
		Delete: 'DEL',
		Insert: 'INS',
		PrintScreen: 'PSCR',
		ScrollLock: 'SLCK',
		Pause: 'PAUSE',
		ContextMenu: 'MENU',
		Numpad0: 'NP0',
		Numpad1: 'NP1',
		Numpad2: 'NP2',
		Numpad3: 'NP3',
		Numpad4: 'NP4',
		Numpad5: 'NP5',
		Numpad6: 'NP6',
		Numpad7: 'NP7',
		Numpad8: 'NP8',
		Numpad9: 'NP9',
		NumpadAdd: 'NPPLUS',
		NumpadSubtract: 'NPMINUS',
		NumpadMultiply: 'NPASTERISK',
		NumpadDivide: 'NPSLASH',
		NumpadDecimal: 'NPDOT',
		NumpadEnter: 'NPENTER'
	};

	function codeToMatrix(code: string): string | null {
		if (/^Key[A-Z]$/.test(code)) return code.slice(3);
		if (/^Digit[0-9]$/.test(code)) return code.slice(5);
		if (/^F([1-9]|1[0-2])$/.test(code)) return code;
		return CODE_MAP[code] ?? null;
	}

	onMount(() => {
		const tick = () => {
			if (!alive) return;
			if (preview) clock.time = performance.now();
			raf = requestAnimationFrame(tick);
		};
		if (preview) raf = requestAnimationFrame(tick);

		const down = (e: KeyboardEvent) => {
			const m = codeToMatrix(e.code);
			if (m) pressed[m] = performance.now();
		};
		const up = (e: KeyboardEvent) => {
			const m = codeToMatrix(e.code);
			if (m) delete pressed[m];
		};
		const blur = () => {
			for (const c in pressed) delete pressed[c];
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		window.addEventListener('blur', blur);
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
			window.removeEventListener('blur', blur);
		};
	});
	const blank = 'rgb(70 191 176)';
	// scale a css color by the current brightness (0..255)
	function dim(css: string): string {
		const k = Math.max(0, Math.min(255, brightness)) / 255;
		if (k >= 1) return css;
		const [r, g, b] = rgbOf(css);
		const h = (v: number) => (Math.round(v * k) & 255).toString(16).padStart(2, '0');
		return `#${h(r)}${h(g)}${h(b)}`;
	}
	function color(code: string): string {
		if (!code) return '#10141a';
		if (preview === 'custom') {
			return dim(custom?.[code] ?? '#0a0a0c');
		}
		const k = keyByCode.get(code);
		if (k && preview) return dim(effectColorOf(preview, effectParams, clock, k, pressed));
		return dim('rgba(255,255,255,0.22)');
	}
	// extract rgb triple from a css color (hex, rgb(r g b), or rgb(r,g,b))
	function rgbOf(css: string): [number, number, number] {
		let m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css.trim());
		if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
		m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(css.trim());
		if (m) return [+m[1], +m[2], +m[3]];
		return [255, 255, 255];
	}
	// glow (shadow) variants derived from the key's own colour, so the "backlight"
	// follows the live effect/theme instead of staying teal. Keys without a code
	// (e.g. the blank Fn key) render a dim, unlit neutral.
	function glow(code: string): string {
		const base = code ? color(code) : '#14181d';
		const [r, g, b] = rgbOf(base);
		return `--color:${base};--box-shadow:rgba(${r},${g},${b},0.5);--box-shadow-inner:rgba(${r},${g},${b},0.1);--text-shadow:rgba(${r},${g},${b},0.25);`;
	}

	// ---- layout copied verbatim from the "It's a Keyboard" pen ----
	interface K {
		label: string;
		code?: string;
		cls?: string;
		pressed?: boolean;
	}
	const ROWS: K[][] = [
		[
			{ label: '` ~', code: 'GRAVE' },
			{ label: '1 !', code: '1' },
			{ label: '2 @', code: '2' },
			{ label: '3 #', code: '3' },
			{ label: '4 $', code: '4' },
			{ label: '5 %', code: '5' },
			{ label: '6 ^', code: '6' },
			{ label: '7 &', code: '7' },
			{ label: '8 *', code: '8' },
			{ label: '9 (', code: '9' },
			{ label: '0 )', code: '0' },
			{ label: '- _', code: 'MINUS' },
			{ label: '= +', code: 'EQUAL' },
			{ label: '\u2190', code: 'BACKSPACE', cls: 'backspace', pressed: true }
		],
		[
			{ label: '\u21E5', code: 'TAB', cls: 'tab', pressed: true },
			{ label: 'Q', code: 'Q' },
			{ label: 'W', code: 'W' },
			{ label: 'E', code: 'E' },
			{ label: 'R', code: 'R' },
			{ label: 'T', code: 'T' },
			{ label: 'Y', code: 'Y' },
			{ label: 'U', code: 'U' },
			{ label: 'I', code: 'I' },
			{ label: 'O', code: 'O' },
			{ label: 'P', code: 'P' },
			{ label: '[ {', code: 'LBRACKET' },
			{ label: '] }', code: 'RBRACKET' },
			{ label: '\\ |', code: 'BACKSLASH', cls: 'backslash' },
			{ label: 'Ins', code: 'INS', cls: 'cluster' },
			{ label: 'Home', code: 'HOME', cls: 'cluster' },
			{ label: 'Pg Up', code: 'PGUP', cls: 'cluster sm' }
		],
		[
			{ label: 'Caps', code: 'CAPS', cls: 'caps' },
			{ label: 'A', code: 'A' },
			{ label: 'S', code: 'S' },
			{ label: 'D', code: 'D' },
			{ label: 'F', code: 'F' },
			{ label: 'G', code: 'G' },
			{ label: 'H', code: 'H' },
			{ label: 'J', code: 'J' },
			{ label: 'K', code: 'K' },
			{ label: 'L', code: 'L' },
			{ label: '; :', code: 'SEMICOLON' },
			{ label: "' \"", code: 'APOSTROPHE' },
			{ label: '\u21B7', code: 'ENTER', cls: 'enter' },
			{ label: 'Del', code: 'DEL', cls: 'cluster' },
			{ label: 'End', code: 'END', cls: 'cluster' },
			{ label: 'Pg Dn', code: 'PGDN', cls: 'cluster sm' }
		],
		[
			{ label: '\u2191', code: 'LSHIFT', cls: 'lshift' },
			{ label: 'Z', code: 'Z' },
			{ label: 'X', code: 'X' },
			{ label: 'C', code: 'C' },
			{ label: 'V', code: 'V' },
			{ label: 'B', code: 'B' },
			{ label: 'N', code: 'N' },
			{ label: 'M', code: 'M' },
			{ label: ', <', code: 'COMMA' },
			{ label: '. >', code: 'PERIOD' },
			{ label: '/ ?', code: 'SLASH' },
			{ label: '\u2191', code: 'RSHIFT', cls: 'rshift' },
			{ label: '\u2191', code: 'UP', cls: 'cluster' }
		],
		[
			{ label: 'Ctrl', code: 'LCTRL', cls: 'ctrl' },
			{ label: 'Cmd', code: 'LSUPER', cls: 'cmd' },
			{ label: 'Alt', code: 'LALT', cls: 'alt' },
			{ label: '\u2014', code: 'SPACE', cls: 'space' },
			{ label: 'Alt', code: 'RALT', cls: 'alt' },
			{ label: 'Menu', code: 'MENU', cls: 'menu' },
			{ label: 'Ctrl', code: 'RCTRL', cls: 'ctrl' },
			{ label: '\u2190', code: 'LEFT', cls: 'cluster' },
			{ label: '\u2193', code: 'DOWN', cls: 'cluster' },
			{ label: '\u2192', code: 'RIGHT', cls: 'cluster' }
		]
	];

	// Function row — shown for full/tkl boards. Esc sits top-left (above Tab),
	// then F1-F12, and the print screen / scroll lock / pause cluster.
	const FN_ROW: K[] = [{ label: 'Esc', code: 'ESC' }];
	const FN_END: K[] = [
		{ label: 'Prt Sc', code: 'PSCR', cls: 'cluster sm' },
		{ label: 'Scroll', code: 'SLCK', cls: 'cluster sm' },
		{ label: 'Pause', code: 'PAUSE', cls: 'cluster sm' }
	];
	for (let i = 1; i <= 12; i++) FN_ROW.push({ label: `F${i}`, code: `F${i}` });
	for (const k of FN_END) FN_ROW.push(k);

	// Numpad block — shown only for full (104-key) boards.
	const NUMPAD: K[][] = [
		[
			{ label: 'Num', code: 'NUMLOCK' },
			{ label: '/', code: 'NPSLASH' },
			{ label: '*', code: 'NPASTERISK' },
			{ label: '-', code: 'NPMINUS' }
		],
		[{ label: '7', code: 'NP7' }, { label: '8', code: 'NP8' }, { label: '9', code: 'NP9' }, { label: '+', code: 'NPPLUS', cls: 'nplus' }],
		[{ label: '4', code: 'NP4' }, { label: '5', code: 'NP5' }, { label: '6', code: 'NP6' }, { label: '', cls: 'blank' }],
		[{ label: '1', code: 'NP1' }, { label: '2', code: 'NP2' }, { label: '3', code: 'NP3' }, { label: '', cls: 'blank' }],
		[{ label: '0', code: 'NP0', cls: 'np0' }, { label: '.', code: 'NPDOT' }, { label: '', cls: 'blank' }, { label: '', cls: 'blank' }]
	];
</script>

<section>
	<div class="keyboard">
		<div class="stage">
		<div class="board">
			{#if showFnRow && FN_ROW.length}
				<div class="row fnrow">
					{#each FN_ROW as k}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<div
							class="key {k.cls ?? ''} {k.pressed ? 'pressed-side' : ''} {k.code && pressed[k.code] ? 'is-pressed' : ''} {k.code && onKeyClick ? 'paintable' : ''}"
							style="{glow(k.code ?? '')}"
							role={k.code && onKeyClick ? 'button' : undefined}
							tabindex={k.code && onKeyClick ? 0 : undefined}
							onclick={k.code && onKeyClick ? () => onKeyClick(k.code!) : undefined}
							onkeydown={k.code && onKeyClick ? (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onKeyClick(k.code!); } } : undefined}
						>
							<span class="key-label">{k.label}</span>
						</div>
					{/each}
				</div>
			{/if}
			{#each ROWS as row}
				<div class="row">
					{#each row as k}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<div
							class="key {k.cls ?? ''} {k.pressed ? 'pressed-side' : ''} {k.code && pressed[k.code] ? 'is-pressed' : ''} {k.code && onKeyClick ? 'paintable' : ''}"
							style="{glow(k.code ?? '')}"
							role={k.code && onKeyClick ? 'button' : undefined}
							tabindex={k.code && onKeyClick ? 0 : undefined}
							onclick={k.code && onKeyClick ? () => onKeyClick(k.code!) : undefined}
							onkeydown={k.code && onKeyClick ? (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onKeyClick(k.code!); } } : undefined}
						>
							<span class="key-label">{k.label}</span>
						</div>
					{/each}
				</div>
			{/each}
		</div>
		{#if showNumpad}
			<div class="numpad">
				{#each NUMPAD as npRow}
					<div class="row">
						{#each npRow as k}
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<div
								class="key {k.cls ?? ''} {k.pressed ? 'pressed-side' : ''} {k.code && pressed[k.code] ? 'is-pressed' : ''} {k.code && onKeyClick ? 'paintable' : ''}"
								style="{glow(k.code ?? '')}"
								role={k.code && onKeyClick ? 'button' : undefined}
								tabindex={k.code && onKeyClick ? 0 : undefined}
								onclick={k.code && onKeyClick ? () => onKeyClick(k.code!) : undefined}
								onkeydown={k.code && onKeyClick ? (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onKeyClick(k.code!); } } : undefined}
							>
								<span class="key-label">{k.label}</span>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
		</div>
	</div>
</section>

<style>
	/* faithful recreation of the original pen (cqi container-relative units) */
	section,
	.keyboard {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.keyboard {
		background-color: #020202;
		background-image: radial-gradient(100% 150% ellipse at top center, #1c1c1c 0%, #020202 100%);
		border-bottom: 0.2cqi solid #020202;
		border-radius: 0.5cqi;
		container-name: keyboard;
		container-type: size;
		padding: 0.5cqi 0.5cqi 1.25cqi;
	}

	@container keyboard (min-width: 0px) {
		.stage {
			display: flex;
			flex: 1;
			gap: 0.5cqi;
			min-height: 0;
		}

		.board {
			box-shadow: inset 0 0 2cqi #020202;
			border-radius: 0.5cqi;
			display: flex;
			flex-direction: column;
			flex: 1;
			min-width: 0;
			overflow: hidden;
			padding: 0.25cqi;
			row-gap: 0.33cqi;
		}

		.row {
			--key-bg: #070707;
			column-gap: 0.33cqi;
			display: flex;
			flex: 1;
		}

		.row:nth-child(1) {
			--key-bg: #0e0e0e;
		}
		.row:nth-child(2) {
			--key-bg: #0c0c0c;
		}
		.row:nth-child(3) {
			--key-bg: #0a0a0a;
		}
		.row:nth-child(4) {
			--key-bg: #090909;
		}

		.key {
			--box-shadow: rgba(70, 191, 176, 0.5);
			--box-shadow-inner: rgba(70, 191, 176, 0.1);
			--color: rgb(70, 191, 176);
			--text-shadow: rgba(70, 191, 176, 0.25);

			background-color: var(--key-bg);
			border: 0;
			border-radius: 0.5cqi;
			box-shadow:
				inset 0 -0.1cqi 0 var(--box-shadow-inner),
				inset 0.1cqi 0 0 rgba(0, 0, 0, 0.75),
				inset -0.1cqi 0 0 rgba(0, 0, 0, 0.75),
				inset 0 0.1cqi 0 var(--box-shadow-inner),
				inset 0 -0.5cqi 0.25cqi 0.85cqi var(--box-shadow-inner),
				0 0 1.25cqi var(--box-shadow);
			color: var(--color);
			cursor: default;
			display: flex;
			flex: 1 6.63%;
			font-size: 1.75cqi;
			font-weight: 400;
			line-height: 0;
			justify-content: center;
			overflow: hidden;
			padding-top: 2cqi;
			position: relative;
			text-shadow: 0 0 0.5cqi var(--text-shadow);
			transition: transform 100ms linear;
			user-select: none;
			white-space: nowrap;
			z-index: 1;
		}
		.key:hover {
			transform: translateY(0.5cqi);
			z-index: 0;
		}
		.key.is-pressed {
			transform: translateY(0.5cqi);
			filter: brightness(1.5) saturate(1.3);
			z-index: 0;
		}

		.key.paintable {
			cursor: pointer;
		}
		.key.paintable:hover {
			box-shadow:
				inset 0 0 0 0.1cqi rgba(255, 255, 255, 0.35),
				inset 0 -0.1cqi 0 var(--box-shadow-inner),
				inset 0.1cqi 0 0 rgba(0, 0, 0, 0.75),
				inset -0.1cqi 0 0 rgba(0, 0, 0, 0.75),
				inset 0 0.1cqi 0 var(--box-shadow-inner),
				inset 0 -0.5cqi 0.25cqi 0.85cqi var(--box-shadow-inner),
				0 0 1.25cqi var(--box-shadow);
		}

		.key-label {
			font-size: 1.35cqi;
			line-height: 0;
		}
		.key.sm .key-label {
			font-size: 1.05cqi;
		}
	}

	.backslash,
	.tab {
		flex: 1 10.21%;
	}
	.ctrl,
	.cmd,
	.menu,
	.fn,
	.alt {
		flex: 1 8.33%;
	}
	.space {
		flex: 1 41.67%;
	}
	.caps {
		flex: 1 11.92%;
	}
	.enter {
		flex: 1 15.15%;
	}
	.lshift {
		flex: 1 15.36%;
	}
	.rshift {
		flex: 1 18.37%;
	}
	.backspace {
		flex: 1 13.81%;
	}
	.cluster {
		flex: 1 8.5%;
	}

	/* ---- function row ---- */
	.fnrow {
		gap: 0.33cqi;
	}
	.fnrow .key {
		flex: 1 0;
	}

	/* ---- numpad block ---- */
	.numpad {
		box-shadow: inset 0 0 2cqi #020202;
		border-radius: 0.5cqi;
		display: flex;
		flex-direction: column;
		flex: 0 0 21%;
		min-width: 0;
		overflow: hidden;
		padding: 0.25cqi;
		row-gap: 0.33cqi;
	}
	.numpad .row {
		--key-bg: #0b0b0b;
		column-gap: 0.33cqi;
		display: flex;
		flex: 1;
	}
	.numpad .key {
		flex: 1 0;
	}
	.numpad .nplus,
	.numpad .np0 {
		flex: 1.8 0;
	}

	/* blank spacer cells (no LED, keep the grid even) */
	.key.blank {
		background-color: transparent;
		box-shadow: none;
		color: transparent;
		cursor: default;
	}

	/* side glyphs (#8211/#2191 etc) should not collide with the glow label */
	.pressed-side .key-label {
		font-size: 1.5cqi;
		font-weight: 700;
	}
</style>