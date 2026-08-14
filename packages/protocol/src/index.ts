/**
 * Core compartilhado do protocolo Cuvave/M-VAVE: framing SysEx (F0 ... F7),
 * codificação bit-shift de 7 bits, checksum e comandos (Init, NameVersion,
 * Erase, WriteMemory, ReadMemory).
 *
 * A implementação real entra no M1, depois de validar com o pedal físico
 * (ver cuvave-spec.md § "O que já sabemos do protocolo" e § "Incógnitas").
 * Por enquanto isto é só o placeholder que prova que o pacote é importável
 * de dentro de apps/web via npm workspaces.
 */
export const PROTOCOL_PACKAGE_READY = true
