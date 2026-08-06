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
		// auto-load the only on-device profile value the HID interface exposes:
		// the current backlight brightness (effects are write-only on Razer).
		const b = await controller.getBrightness().catch(() => null);
		if (b != null) brightness.set(b);
	} catch (err) {
		error.set(err instanceof Error ? err.message : String(err));
		connected.set(false);
	}
}

export const brightness = writable<number | null>(null);

export async function disconnect(): Promise<void> {
	await controller.disconnect();
	connected.set(false);
	deviceInfo.set(null);
}

export function controllerBus(): KeyboardController {
	return controller;
}