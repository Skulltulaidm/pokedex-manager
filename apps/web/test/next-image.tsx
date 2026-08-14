import type { ComponentProps } from "react";

type StubProps = Omit<ComponentProps<"img">, "src"> & {
  src: string;
  fill?: boolean;
  priority?: boolean;
};

/** Stands in for next/image, keeping the geometry props the crop maths writes. */
export default function Image({ fill, priority, alt, ...props }: StubProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      data-fill={fill ? "" : undefined}
      data-priority={priority ? "" : undefined}
      {...props}
    />
  );
}
