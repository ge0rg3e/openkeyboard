import { LOGITECH_VID } from './constants';
import { getLogitechKeyboard, LOGITECH_SUPPORTED_PIDS, type LogitechDevice } from './devices';
import { logger } from '../razer/logger';
import type { LogiReport } from './report';

export interface LogitechHandle {
	name: string;
	pid: number;
	productName: string;
	serial?: string;
	layout: LogitechDevice | undefined;
}

interface HidCollection {
	usagePage?: number;
	usage?: number;
	type?: string;
	children?: unknown[];
}

export interface HidDevice {
	vendorId: number;
	productId: number;
	productName: string;
	opened: boolean;
	open: () => Promise<void>;
	close: () => Promise<void>;
	sendReport: (reportId: number, data: BufferSource) => Promise<void>;
	addEventListener?: (type: string, callback: EventListenerOrEventListenerObject) => void;
	collections?: HidCollection[];
}

type HidRequest = (opts: { filters?: Array<{ vendorId?: number; productId?: number }> }) => Promise<HidDevice[]>;

function webhidSupported(): boolean {
	return typeof window !== 'undefined' && (window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
}

export class LogitechTransport {
	private device: HidDevice | null = null;
	private handleValue: LogitechHandle | null = null;

	get handle(): LogitechHandle | undefined {
		return this.handleValue ?? undefined;
	}

	get connected(): boolean {
		return !!this.device?.opened;
	}

	async open(granted?: HidDevice[]): Promise<LogitechHandle> {
		if (!webhidSupported() || !navigator.hid) {
			throw new Error('WebHID is not available in this browser context.');
		}
		const request = navigator.hid.requestDevice as unknown as HidRequest;
		const requested = granted ?? (await request({ filters: [{ vendorId: LOGITECH_VID }] }));
		const candidates = requested.filter((d) => LOGITECH_SUPPORTED_PIDS.includes(d.productId));
		if (candidates.length === 0) {
			throw new Error('No supported Logitech keyboard was granted. Choose a Logitech RGB keyboard from the picker.');
		}
		const device = candidates[0];
		await device.open();
		this.device = device;
		const spec = getLogitechKeyboard(device.productId);
		this.handleValue = {
			name: spec?.name ?? device.productName,
			pid: device.productId,
			productName: device.productName,
			serial: undefined,
			layout: spec
		};
		this.attachInputListener();
		logger.info(`Logitech transport opened: ${this.handleValue.name} (0x${device.productId.toString(16).padStart(4, '0')})`);
		return this.handleValue;
	}

	async send(report: LogiReport): Promise<void> {
		if (!this.device) throw new Error('Logitech transport is not open.');
		await this.device.sendReport(report.reportId, report.data);
		const full = new Uint8Array(report.data.length + 1);
		full[0] = report.reportId;
		full.set(report.data, 1);
		logger.tx(`logi report 0x${report.reportId.toString(16)}`, full);
	}

	async sendBurst(report: LogiReport): Promise<void> {
		return this.send(report);
	}

	private attachInputListener(): void {
		if (!this.device) return;
		const handler = (event: Event) => {
			const e = event as Event & { reportId?: number; data?: DataView };
			if (e.data) {
				const bytes = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
				logger.rx(`logi input 0x${(e.reportId ?? 0).toString(16)}`, bytes);
			}
		};
		this.device.addEventListener?.('inputreport', handler);
	}

	async close(): Promise<void> {
		if (this.device) {
			await this.device.close();
			this.device = null;
			this.handleValue = null;
		}
	}
}
