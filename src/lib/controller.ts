import { getKeyboard, type KeyboardDevice } from './razer/devices';
import { Transport, WebHidTransport, webhidSupported } from './razer/transport';
import { REPORT_LEN, ARG_BASE, crc, type CommandReport } from './razer/report';
import * as C from './razer/commands';
import { LED } from './razer/constants';

export type ConnectionMode = 'detect';

export interface DeviceInfo {
	pid: number;
	name: string;
	serial?: string;
	firmware?: string;
	kbd?: KeyboardDevice;
}

export type EffectKind = 'off' | 'static' | 'wave' | 'spectrum' | 'reactive' | 'breathing' | 'starlight' | 'custom';

export interface EffectParams {
	kind: EffectKind;
	color?: string; // '#rrggbb'
	color2?: string;
	speed?: number; // 1..4
	direction?: 'left' | 'right';
	mode?: 'single' | 'dual' | 'random';
}

export class KeyboardController {
	private transport: Transport | null = null;
	private infoValue: DeviceInfo | null = null;

	get connected(): boolean {
		return !!this.transport?.connected;
	}
	get info(): DeviceInfo | null {
		return this.infoValue;
	}

	async connect(): Promise<DeviceInfo> {
		if (this.transport) await this.disconnect();
		const t = new WebHidTransport();
		await t.open();
		this.transport = t;
		const h = t.handle;
		if (!h) throw new Error('No device handle.');
		const spec = h.pid ? getKeyboard(h.pid) : undefined;
		this.infoValue = {
			pid: h.pid,
			name: spec?.name ?? h.name,
			kbd: spec,
			serial: await this.readSerial().catch(() => undefined),
			firmware: await this.readFirmware().catch(() => undefined)
		};
		return this.infoValue;
	}

	async disconnect(): Promise<void> {
		if (this.transport) await this.transport.close();
		this.transport = null;
		this.infoValue = null;
	}

	get device(): KeyboardDevice | undefined {
		return this.infoValue?.kbd;
	}

	private get dtoId(): number {
		return this.infoValue?.kbd?.transactionId ?? 0xff;
	}

	private get isExt(): boolean {
		return this.infoValue?.kbd?.style === 'extended';
	}

	private async send(report: CommandReport): Promise<Uint8Array | null> {
		if (!this.transport) throw new Error('Not connected.');
		report.transactionId = this.dtoId;
		const resp = await this.transport.send(report);
		if (resp && resp.length >= REPORT_LEN && resp[88] !== crc(resp)) {
			// warn once via logger
		}
		return resp;
	}

	private async readSerial(): Promise<string> {
		const r = await this.send(C.getSerial());
		return r ? ascii(r, 8, 22) : '';
	}
	private async readFirmware(): Promise<string> {
		const r = await this.send(C.getFirmware());
		return r ? ascii(r, 8, 2) : '';
	}

	private parseColor(hex?: string): C.RGB {
		return hexToRgb(hex ?? '#ffffff') ?? { r: 0xff, g: 0xff, b: 0xff };
	}

	async apply(params: EffectParams): Promise<void> {
		const vs = 1; // VARSTORE
		const led = LED.BACKLIGHT;
		const report = this.buildEffect(params, vs, led);
		report.transactionId = this.dtoId;
		await this.send(report);
	}

	private buildEffect(p: EffectParams, vs: number, led: number): CommandReport {
		switch (p.kind) {
			case 'off':
				return this.isExt ? C.extendedEffectNone(vs, led) : C.classicEffectNone();
			case 'static':
				return this.isExt ? C.extendedEffectStatic(vs, led, this.parseColor(p.color)) : C.classicEffectStatic(this.parseColor(p.color));
			case 'spectrum':
				return this.isExt ? C.extendedEffectSpectrum(vs, led) : C.classicEffectSpectrum();
			case 'wave': {
				// WAVE_RIGHT is byte 1 on every board. For "left", classic and modern
				// extended matrices expect 2. OpenRazer registers some old extended
				// boards (Huntsman family, BlackWidow Elite) as WAVE_DIRS=(0,1), but
				// those devices clamp 2 down to 1 and ignore 0, so left can never
				// work there; the firmware actually wants 2 as well. Override with
				// waveLeft when a board genuinely needs 0.
				const dir = p.direction === 'left' ? (this.device?.waveLeft ?? 2) : 1;
				return this.isExt ? C.extendedEffectWave(vs, led, dir) : C.classicEffectWave(dir);
			}
			case 'reactive':
				return this.isExt ? C.extendedEffectReactive(vs, led, p.speed ?? 2, this.parseColor(p.color)) : C.classicEffectReactive(p.speed ?? 2, this.parseColor(p.color));
			case 'breathing':
				return this.buildBreathing(p, vs, led);
			case 'starlight':
				return this.buildStarlight(p, vs, led);
			default:
				throw new Error(`Unsupported effect: ${p.kind}`);
		}
	}

	private buildBreathing(p: EffectParams, vs: number, led: number): CommandReport {
		if (p.mode === 'dual') {
			return this.isExt
				? C.extendedEffectBreathingDual(vs, led, this.parseColor(p.color), this.parseColor(p.color2))
				: C.classicEffectBreathingDual(this.parseColor(p.color), this.parseColor(p.color2));
		}
		if (p.mode === 'random') {
			return this.isExt ? C.extendedEffectBreathingRandom(vs, led) : C.classicEffectBreathingRandom();
		}
		return this.isExt ? C.extendedEffectBreathingSingle(vs, led, this.parseColor(p.color)) : C.classicEffectBreathingSingle(this.parseColor(p.color));
	}

	private buildStarlight(p: EffectParams, vs: number, led: number): CommandReport {
		if (p.mode === 'random') {
			return this.isExt ? C.extendedEffectStarlightRandom(vs, led, p.speed ?? 3) : C.classicEffectStarlightRandom(p.speed ?? 3);
		}
		if (p.mode === 'dual') {
			return this.isExt
				? C.extendedEffectStarlightDual(vs, led, p.speed ?? 3, this.parseColor(p.color), this.parseColor(p.color2))
				: C.classicEffectStarlightDual(p.speed ?? 3, this.parseColor(p.color), this.parseColor(p.color2));
		}
		return this.isExt ? C.extendedEffectStarlightSingle(vs, led, p.speed ?? 3, this.parseColor(p.color)) : C.classicEffectStarlightSingle(p.speed ?? 3, this.parseColor(p.color));
	}

	async setBrightness(value: number): Promise<void> {
		const vs = 1;
		const led = LED.BACKLIGHT;
		const rep = this.isExt ? C.extendedBrightness(vs, led, value) : C.setLedBrightness(vs, led, value);
		rep.transactionId = this.dtoId;
		await this.send(rep);
	}

	async getBrightness(): Promise<number | null> {
		const vs = 1;
		const led = LED.BACKLIGHT;
		const rep = this.isExt ? C.getExtendedBrightness(vs, led) : C.getLedBrightness(vs, led);
		rep.transactionId = this.dtoId;
		const resp = await this.send(rep);
		return resp && resp.length >= REPORT_LEN ? resp[ARG_BASE + 2] : null;
	}
}

function hexToRgb(hex: string): C.RGB | null {
	const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
	if (!m) return null;
	return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function ascii(bytes: Uint8Array, offset: number, len: number): string {
	let s = '';
	const end = Math.min(offset + len, bytes.length);
	for (let i = offset; i < end; i++) {
		const c = bytes[i];
		if (c >= 32 && c <= 126) s += String.fromCharCode(c);
	}
	return s.trim();
}

export { webhidSupported };
