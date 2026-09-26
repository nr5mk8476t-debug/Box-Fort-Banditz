// Preview-page only: multiplayer is unavailable (no server), so networking is stubbed out.
const off = () => { throw new Error("Multiplayer isn't available in the preview page"); };
export function serverUrl(): string { return ""; }
export function rememberRoom(): void {}
export function forgetRoom(): void {}
export function friendlyError(): string { return "Multiplayer isn't available in the preview page."; }
export async function createRoom(): Promise<any> { return off(); }
export async function joinRoom(): Promise<any> { return off(); }
export function inviteLink(code: string): string { return code; }
export function roomCodeFromUrl(): string | null { return null; }
export function setUrlRoom(): void {}
