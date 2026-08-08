// Shared application state - a vendor-agnostic controller facade used across views.
import { writable } from 'svelte/store';
import { KeyboardController, type DeviceInfo, type EffectParams } from './controller';
import { LogitechKeyboardController, type LogitechDeviceInfo } from './logitech/controller';
import { LOGITECH_VID } from './logitech/constants';
import { LOGITECH_SUPPORTED_PIDS } from './logitech/devices';
import { getKeyboard } from './razer/devices';
import { logger } from './razer/logger';
import { WebHidTransport } from './razer/transport';

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

type RawDevice = NonNullable<Parameters<WebHidTransport['open']>[0]>[number];

async function requestDevices(): Promise<RawDevice[]> {
	if (!navigator.hid) throw new Error('WebHID is not available in this browser.');
	// Ask for both brands at once so the chooser lists every supported keyboard
	// that is plugged in; the vendor is picked from whatever the user grants.
	return navigator.hid.requestDevice({
		filters: [{ vendorId: 0x1532 }, { vendorId: LOGITECH_VID }]
	});
}

export async function connect(): Promise<void> {
	error.set(null);
	try {
		if (active) await active.disconnect();
		active = null;
		const granted = await requestDevices();
		const logiDevices = granted.filter((d) => d.vendorId === LOGITECH_VID && LOGITECH_SUPPORTED_PIDS.includes(d.productId));
		const razerDevices = granted.filter((d) => getKeyboard(d.productId) !== undefined);
		if (logiDevices.length > 0) {
			const info = await logitechController.connect(logiDevices);
			active = logitechController;
			deviceInfo.set(info);
		} else if (razerDevices.length > 0) {
			const info = await razerController.connect(razerDevices);
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
		} else {
			throw new Error('No supported keyboard was selected. Grant access to a Razer Chroma or Logitech G-series RGB keyboard.');
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
