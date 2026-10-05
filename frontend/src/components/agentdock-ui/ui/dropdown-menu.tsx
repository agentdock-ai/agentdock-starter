"use client";
import type { ComponentProps } from "react";
import { DropdownMenu as Primitive } from "radix-ui";

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuItem = Primitive.Item;
export function DropdownMenuContent(
  props: ComponentProps<typeof Primitive.Content>,
) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        {...props}
      />
    </Primitive.Portal>
  );
}
