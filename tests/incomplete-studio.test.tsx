import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProjectDetail } from "../lib/api/types";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
import { ProjectStudioClient } from "../components/projects/ProjectStudioClient";

function render(completed:number) {
  const project:ProjectDetail={id:"project",title:"Product",status:"ready",originalCount:1,generatedCount:completed,primaryPreviewUrl:null,
    updatedAt:"2026-01-01",assets:[],activeBatchId:null,latestBatchId:"terminal-batch",
    shots:Array.from({length:8},(_,i)=>({id:String(i),label:`View ${i}`,presetKey:null,azimuth:i*45,elevation:0,
      versions:i<completed?[{outputId:String(i),version:1,mimeType:"image/png",previewUrl:`https://example.invalid/${i}.png`,downloadUrl:"/download",approvedAt:null,selectedAt:null,createdAt:"2026-01-01"}]:[]}))};
  return renderToStaticMarkup(<ProjectStudioClient initialProject={project} checkoutAvailable={false} walletButton={<span>Balance</span>} pageError={null}/>);
}

describe("reopened studio rotation coverage",()=>{
  it("warns about a missing angle before fetching the old terminal batch and disables only autoplay",()=>{
    const html=render(7);
    expect(html).toContain("Incomplete rotation: 7 of 8 views ready.");
    expect(html).toContain("Missing: View 7");
    expect(html).toMatch(/title="Autoplay requires a complete set" disabled=""/);
    expect(html).toMatch(/aria-label="Rotate left"><svg/);
    expect(html).toMatch(/aria-label="Rotate right"><svg/);
  });
  it("allows a completed set to play without an incomplete warning",()=>{
    const html=render(8);
    expect(html).not.toContain("Incomplete rotation:");
    expect(html).not.toContain("Autoplay requires a complete set");
  });
});
