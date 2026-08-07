// Shared application state — single KeyboardController instance used across views.
import { writable } from 'svelte/store';
import { KeyboardController, type DeviceInfo } from './controller';
import { logger } from './razer/logger';

export const controller = new KeyboardController();

export const connected = writable(false);
export const deviceInfo = writable<DeviceInfo | null>(null);
export const error = writable<string | null>(null);
export const logVersion = writable(0);

// bump logVersion whenever the logger grows so the debug view re-renders
const origLog = logger.log.bind(logger);
logger.log = (level, message, hex, direction) => {
	origLog(level, message, hex, direction);
	logVersion.update((v) => v + 1);
};

export async function connect(): Promise<void> {
	error.set(null);
	try {
		const info = await controller.connect();
		deviceInfo.set(info);
		connected.set(controller.connected);
		// auto-load the on-device state the HID interface exposes: backlight
		// brightness, game-mode and macro-LED flags. Effects are write-only on
		// Razer so the current effect itself can't be read back.
		const b = await controller.getBrightness().catch(() => null);
		if (b != null) brightness.set(b);
		const gm = await controller.getGameMode().catch(() => null);
		if (gm != null) gameMode.set(gm);
		const ml = await controller.getMacroLeds().catch(() => null);
		if (ml != null) macroLed.set(ml);
		if (info.kbd?.battery) {
			const b = await controller.getBattery().catch(() => null);
			if (b) battery.set(b);
		}
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
	await controller.disconnect();
	connected.set(false);
	deviceInfo.set(null);
}

export function controllerBus(): KeyboardController {
	return controller;
}