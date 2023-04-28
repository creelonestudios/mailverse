/// <reference types="node" resolution-mode="require"/>
import net from "net";
export type EnhancedStatusSubject = {
    code: number;
    name: string;
};
export interface StatusCode {
    code: number;
    message?: string;
    ok: boolean;
}
export interface EnhancedStatusCode extends StatusCode {
    class: number;
    subject: number;
    detail: number;
}
type EnhancedCode = `${bigint}.${bigint}.${bigint}`;
type StatusOptions = {
    message?: string;
    enhancedCode?: EnhancedCode;
    args?: string[];
};
export default function sendStatus(socket: net.Socket): (code: number, options?: StatusOptions | EnhancedCode) => void;
export declare function status(code: number, options?: StatusOptions | EnhancedCode): string;
export {};
