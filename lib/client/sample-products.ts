import type { StaticImageData } from "next/image";
import dollFront from "@/public/assets/angle-guides/front.jpg";
import dollFrontRight from "@/public/assets/angle-guides/front-three-quarter.jpg";
import dollRight from "@/public/assets/angle-guides/right-profile.jpg";
import dollBackRight from "@/public/assets/angle-guides/back-right-three-quarter.jpg";
import dollBack from "@/public/assets/angle-guides/back.jpg";
import dollBackLeft from "@/public/assets/angle-guides/back-left-three-quarter.jpg";
import dollLeft from "@/public/assets/angle-guides/left-profile.jpg";
import dollFrontLeft from "@/public/assets/angle-guides/front-left-three-quarter.jpg";
import mugFront from "@/public/assets/samples/ceramic-mug/front.jpg";
import mugFrontRight from "@/public/assets/samples/ceramic-mug/front-three-quarter.jpg";
import mugRight from "@/public/assets/samples/ceramic-mug/right-profile.jpg";
import mugBackRight from "@/public/assets/samples/ceramic-mug/back-right-three-quarter.jpg";
import mugBack from "@/public/assets/samples/ceramic-mug/back.jpg";
import mugBackLeft from "@/public/assets/samples/ceramic-mug/back-left-three-quarter.jpg";
import mugLeft from "@/public/assets/samples/ceramic-mug/left-profile.jpg";
import mugFrontLeft from "@/public/assets/samples/ceramic-mug/front-left-three-quarter.jpg";
import handbagFront from "@/public/assets/samples/leather-handbag/front.jpg";
import handbagFrontRight from "@/public/assets/samples/leather-handbag/front-three-quarter.jpg";
import handbagRight from "@/public/assets/samples/leather-handbag/right-profile.jpg";
import handbagBackRight from "@/public/assets/samples/leather-handbag/back-right-three-quarter.jpg";
import handbagBack from "@/public/assets/samples/leather-handbag/back.jpg";
import handbagBackLeft from "@/public/assets/samples/leather-handbag/back-left-three-quarter.jpg";
import handbagLeft from "@/public/assets/samples/leather-handbag/left-profile.jpg";
import handbagFrontLeft from "@/public/assets/samples/leather-handbag/front-left-three-quarter.jpg";

type SampleProductSource = {
  id: string;
  label: string;
  description: string;
  images: StaticImageData[];
  offsets?: { x: number; y: number; scale?: number }[];
};

const views = [
  { id: "front", label: "Front" },
  { id: "front-three-quarter", label: "Right three-quarter" },
  { id: "right-profile", label: "Right profile" },
  { id: "back-right-three-quarter", label: "Back-right three-quarter" },
  { id: "back", label: "Back" },
  { id: "back-left-three-quarter", label: "Back-left three-quarter" },
  { id: "left-profile", label: "Left profile" },
  { id: "front-left-three-quarter", label: "Left three-quarter" },
] as const;

const productSources: SampleProductSource[] = [
  {
    id: "linen-doll",
    label: "Linen doll",
    description: "linen doll",
    images: [dollFront, dollFrontRight, dollRight, dollBackRight, dollBack, dollBackLeft, dollLeft, dollFrontLeft],
    offsets: undefined,
  },
  {
    id: "ceramic-mug",
    label: "Ceramic mug",
    description: "cobalt-blue ceramic mug",
    images: [mugFront, mugFrontRight, mugRight, mugBackRight, mugBack, mugBackLeft, mugLeft, mugFrontLeft],
    // Source-pixel offsets register the ceramic foot at (627, 1003).
    // Centering the whole silhouette would move the body as the handle turns.
    offsets: [
      { x: 58, y: 1 },
      { x: 58, y: 0 },
      { x: 20.5, y: 0 },
      { x: 17, y: 0 },
      { x: 2, y: 2 },
      { x: 54, y: 0 },
      { x: 58.5, y: 0 },
      { x: 55.5, y: 0 },
    ],
  },
  {
    id: "leather-handbag",
    label: "Leather handbag",
    description: "cognac leather handbag",
    images: [handbagFront, handbagFrontRight, handbagRight, handbagBackRight, handbagBack, handbagBackLeft, handbagLeft, handbagFrontLeft],
    // Uniform scale and translation register the resting base and handle height.
    offsets: [
      { x: 4, y: 0, scale: 1 },
      { x: 19.649302, y: 1.443721, scale: 0.965581395 },
      { x: 19.858634, y: -0.907021, scale: 0.984819734 },
      { x: 20.53352, y: 6.212291, scale: 0.966480447 },
      { x: 5.697115, y: 2.130769, scale: 0.998076923 },
      { x: 24.150418, y: 2.534819, scale: 0.963788301 },
      { x: 7.824442, y: -12.556741, scale: 1.006789525 },
      { x: 18.314448, y: 5.308782, scale: 0.980169972 },
    ],
  },
];

export const sampleProducts = productSources.map(({ images, offsets, ...product }) => ({
  ...product,
  angles: views.map((view, index) => ({ ...view, image: images[index], offset: offsets?.[index] })),
}));
