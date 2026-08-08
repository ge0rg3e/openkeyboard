// Shared application state — a vendor-agnostic controller facade used across views.
import { writable } from 'svelte/store';
import { KeyboardController, type DeviceInfo, type EffectParams } from './controller';
import { LogitechKeyboardController, type LogitechDeviceInfo } from './logitech/controller';
import { logger } from './razer/logger';

export type Vendor = 'razer' | 'logitech';

export type ConnectedDevice = (DeviceInfo & { vendor: 'razer' }) | LogitechDeviceInfo;

/** The subset of a vendor controller the UI talks to. */
export interface AppController {
	readonly connected: boolean;
	apply(params: EffectParams): Promise<void>;
	setBrightness(value: number): Promise<void>;
	setGameMode(enabled: boolean): Promise<void>;
	setMacroLeds(enabled: boolean): Promise<void>;
}

export const razerController = new KeyboardController();
export const logitechController = new LogitechKeyboardController();

let active: KeyboardController | LogitechKeyboardController | null = null;

export const controller: AppController = {
	get connected(): boolean {
		return !!active?.connected;
	},
	apply(params: EffectParams): Promise<void> {
		return active ? active.apply(params) : Promise.reject(new Error('Not connected.'));
	},
	setBrightness(value: number): Promise<void> {
		return active ? active.setBrightness(value) : Promise.reject(new Error('Not connected.'));
	},
	setGameMode(enabled: boolean): Promise<void> {
		return active ? active.setGameMode(enabled) : Promise.reject(new Error('Not connected.'));
	},
	setMacroLeds(enabled: boolean): Promise<void> {
		return active ? active.setMacroLeds(enabled) : Promise.reject(new Error('Not connected.'));
	}
};

export const connected = writable(false);
export const deviceInfo = writable<ConnectedDevice | null>(null);
export const error = writable<string | null>(null);
export const logVersion = writable(0);

// bump logVersion whenever the logger grows so the debug view re-renders
const origLog = logger.log.bind(logger);
logger.log = (level, message, hex, direction) => {
	origLog(level, message, hex, direction);
	logVersion.update((v) => v + 1);
};

const VENDOR_KEY = 'openkeyboard:vendor';

export function lastVendor(): Vendor {
	if (typeof localStorage === 'undefined') return 'razer';
	return localStorage.getItem(VENDOR_KEY) === 'logitech' ? 'logitech' : 'razer';
}

export async function connect(vendor?: Vendor): Promise<void> {
	const chosen: Vendor = vendor ?? lastVendor();
	error.set(null);
	try {
		if (active) await active.disconnect();
		active = null;
		if (chosen === 'logitech') {
			const info = await logitechController.connect();
			active = logitechController;
			deviceInfo.set(info);
		} else {
			const info = await razerController.connect();
			active = razerController;
			deviceInfo.set({ ...info, vendor: 'razer' });
			// auto-load the on-device state the HID interface exposes: backlight
			// brightness, game-mode and macro-LED flags. Effects are write-only on
			// Razer so the current effect itself can't be read back.
			const b = await razerController.getBrightness().catch(() => null);
			if (b != null) brightness.set(b);
			const gm = await razerController.getGameMode().catch(() => null);
			if (gm != null) gameMode.set(gm);
			const ml = await razerController.getMacroLeds().catch(() => null);
			if (ml != null) macroLed.set(ml);
			if (info.kbd?.battery) {
				const bat = await razerController.getBattery().catch(() => null);
				if (bat) battery.set(bat);
			}
		}
		try {
			localStorage.setItem(VENDOR_KEY, chosen);
		} catch {
			/* storage unavailable */
		}
		connected.set(controller.connected);
	} catch (err) {
		error.set(err instanceof Error ? err.message : String(err));
		connected.set(false);
	}
}

export const brightness = writable<number | null>(null);
export const gameMode = writable<boolean | null>(null);
export const macroLed = writable<boolean | null>(null);
export const battery = writable<{ level: number; charging: boolean } | null>(null);

export async function disconnect(): Promise<void> {
	if (active) await active.disconnect();
	active = null;
	connected.set(false);
	deviceInfo.set(null);
}

export function controllerBus(): AppController {
	return controller;
}
