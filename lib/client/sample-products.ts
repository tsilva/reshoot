import type { StaticImageData } from "next/image";
import sampleFraming from "@/lib/client/sample-framing.json";
import dollUpload from "@/public/assets/samples/example-uploads/linen-doll.jpg";
import mugUpload from "@/public/assets/samples/example-uploads/ceramic-mug.jpg";
import handbagUpload from "@/public/assets/samples/example-uploads/leather-handbag.jpg";
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
  upload: StaticImageData;
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
    upload: dollUpload,
    images: [dollFront, dollFrontRight, dollRight, dollBackRight, dollBack, dollBackLeft, dollLeft, dollFrontLeft],
    offsets: sampleFraming["linen-doll"],
  },
  {
    id: "ceramic-mug",
    label: "Ceramic mug",
    description: "cobalt-blue ceramic mug",
    upload: mugUpload,
    images: [mugFront, mugFrontRight, mugRight, mugBackRight, mugBack, mugBackLeft, mugLeft, mugFrontLeft],
    offsets: sampleFraming["ceramic-mug"],
  },
  {
    id: "leather-handbag",
    label: "Leather handbag",
    description: "cognac leather handbag",
    upload: handbagUpload,
    images: [handbagFront, handbagFrontRight, handbagRight, handbagBackRight, handbagBack, handbagBackLeft, handbagLeft, handbagFrontLeft],
    offsets: sampleFraming["leather-handbag"],
  },
];

export const sampleProducts = productSources.map(({ images, offsets, upload, ...product }) => ({
  ...product,
  upload,
  angles: views.map((view, index) => ({ ...view, image: images[index], offset: offsets?.[index] })),
}));
