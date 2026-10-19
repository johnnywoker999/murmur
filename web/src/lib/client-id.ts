import { nanoid } from "nanoid";

export function createClientId() {
    // randomUUID 在 HTTP 內網地址下不可用；nanoid 依賴仍可用的 getRandomValues。
    return nanoid();
}
