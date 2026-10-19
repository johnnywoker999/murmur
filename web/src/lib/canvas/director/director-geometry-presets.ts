import { createDirectorObject } from "@/lib/canvas/director/director-scene";
import type { DirectorObject, DirectorPrimitiveKind } from "@/types/director";

export type DirectorGeometryPresetId = Exclude<DirectorPrimitiveKind, "plane" | "character">;

export const DIRECTOR_GEOMETRY_PRESET_OPTIONS: ReadonlyArray<{ id: DirectorGeometryPresetId; label: string; primitive: DirectorPrimitiveKind }> = [
    { id: "box", label: "立方體", primitive: "box" },
    { id: "sphere", label: "球體", primitive: "sphere" },
    { id: "cylinder", label: "圓柱體", primitive: "cylinder" },
    { id: "torus", label: "環狀體", primitive: "torus" },
    { id: "cone", label: "圓錐", primitive: "cone" },
    { id: "pyramid", label: "稜錐", primitive: "pyramid" },
    { id: "empty", label: "新增空物件", primitive: "empty" },
];

export function createDirectorGeometricObject(preset: DirectorGeometryPresetId): DirectorObject {
    const option = DIRECTOR_GEOMETRY_PRESET_OPTIONS.find((item) => item.id === preset)!;
    return createDirectorObject(option.primitive, option.label);
}
