export type PaperId = "glossy" | "plain";

export interface Paper {
  id: PaperId;
  name: string;
  detail: string;
  /** Epson driver: Print Settings, Media Type. */
  mediaType: string;
  /** Epson driver: Print Settings, Print Quality. */
  quality: string;
  load: string;
  after: string;
}

export const PAPERS: Record<PaperId, Paper> = {
  glossy: {
    id: "glossy",
    name: "Glossy photo",
    detail: "Canon GP-701",
    mediaType: "Photo Paper Glossy",
    quality: "High Quality",
    load: "One sheet in the back feeder, shiny side up. When the printer asks, choose Letter and a glossy paper type.",
    after: "Let it dry for about 10 minutes before you cut, or the ink can smudge.",
  },
  plain: {
    id: "plain",
    name: "Plain paper",
    detail: "Hammermill · for a test print first",
    mediaType: "Plain Paper / Bright White Paper",
    quality: "Normal",
    load: "Plain paper in the back feeder. When the printer asks, choose Letter and Plain Paper.",
    after: "Measure one print with a ruler and check the framing before you use photo paper.",
  },
};

export const PRINTER_NAME = "EPSON ET-2850 (Epson driver)";
