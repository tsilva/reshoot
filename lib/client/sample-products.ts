import type { StaticImageData } from "next/image";
import dollUpload from "@/public/assets/samples/example-uploads/linen-doll.jpg";
import mugUpload from "@/public/assets/samples/example-uploads/ceramic-mug.jpg";
import handbagUpload from "@/public/assets/samples/example-uploads/leather-handbag.jpg";
import dollFront from "@/public/assets/samples/display/linen-doll/front.webp";
import opening384 from "@/public/assets/samples/display/linen-doll/front-384.avif";
import opening640 from "@/public/assets/samples/display/linen-doll/front-640.avif";
import opening750 from "@/public/assets/samples/display/linen-doll/front-750.avif";
import opening828 from "@/public/assets/samples/display/linen-doll/front-828.avif";
import opening1080 from "@/public/assets/samples/display/linen-doll/front-1080.avif";
import opening1254 from "@/public/assets/samples/display/linen-doll/front-1254.avif";
import dollFrontRight from "@/public/assets/samples/display/linen-doll/front-three-quarter.webp";
import dollRight from "@/public/assets/samples/display/linen-doll/right-profile.webp";
import dollBackRight from "@/public/assets/samples/display/linen-doll/back-right-three-quarter.webp";
import dollBack from "@/public/assets/samples/display/linen-doll/back.webp";
import dollBackLeft from "@/public/assets/samples/display/linen-doll/back-left-three-quarter.webp";
import dollLeft from "@/public/assets/samples/display/linen-doll/left-profile.webp";
import dollFrontLeft from "@/public/assets/samples/display/linen-doll/front-left-three-quarter.webp";
import mugFront from "@/public/assets/samples/display/ceramic-mug/front.webp";
import mugFrontRight from "@/public/assets/samples/display/ceramic-mug/front-three-quarter.webp";
import mugRight from "@/public/assets/samples/display/ceramic-mug/right-profile.webp";
import mugBackRight from "@/public/assets/samples/display/ceramic-mug/back-right-three-quarter.webp";
import mugBack from "@/public/assets/samples/display/ceramic-mug/back.webp";
import mugBackLeft from "@/public/assets/samples/display/ceramic-mug/back-left-three-quarter.webp";
import mugLeft from "@/public/assets/samples/display/ceramic-mug/left-profile.webp";
import mugFrontLeft from "@/public/assets/samples/display/ceramic-mug/front-left-three-quarter.webp";
import handbagFront from "@/public/assets/samples/display/leather-handbag/front.webp";
import handbagFrontRight from "@/public/assets/samples/display/leather-handbag/front-three-quarter.webp";
import handbagRight from "@/public/assets/samples/display/leather-handbag/right-profile.webp";
import handbagBackRight from "@/public/assets/samples/display/leather-handbag/back-right-three-quarter.webp";
import handbagBack from "@/public/assets/samples/display/leather-handbag/back.webp";
import handbagBackLeft from "@/public/assets/samples/display/leather-handbag/back-left-three-quarter.webp";
import handbagLeft from "@/public/assets/samples/display/leather-handbag/left-profile.webp";
import handbagFrontLeft from "@/public/assets/samples/display/leather-handbag/front-left-three-quarter.webp";

type SampleProductSource = {
  id: string;
  label: string;
  description: string;
  upload: StaticImageData;
  images: StaticImageData[];
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
  },
  {
    id: "ceramic-mug",
    label: "Ceramic mug",
    description: "cobalt-blue ceramic mug",
    upload: mugUpload,
    images: [mugFront, mugFrontRight, mugRight, mugBackRight, mugBack, mugBackLeft, mugLeft, mugFrontLeft],
  },
  {
    id: "leather-handbag",
    label: "Leather handbag",
    description: "cognac leather handbag",
    upload: handbagUpload,
    images: [handbagFront, handbagFrontRight, handbagRight, handbagBackRight, handbagBack, handbagBackLeft, handbagLeft, handbagFrontLeft],
  },
];

export const sampleProducts = productSources.map(({ images, upload, ...product }) => ({
  ...product,
  upload,
  angles: views.map((view, index) => ({ ...view, image: images[index] })),
}));

// Turbopack emits AVIF files as-is and does not read their dimensions.
export const openingSampleSources = [
  { src: opening384.src, width: 384 },
  { src: opening640.src, width: 640 },
  { src: opening750.src, width: 750 },
  { src: opening828.src, width: 828 },
  { src: opening1080.src, width: 1080 },
  { src: opening1254.src, width: 1254 },
];
