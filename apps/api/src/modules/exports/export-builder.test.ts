import { describe, expect, it } from "vitest";
import { unzip } from "../../test/unzip";
import { rupees, zipCsvs } from "./export-builder";

describe("export builder", () => {
  it("writes paise as rupees without floats", () => {
    expect(rupees(0)).toBe("0.00");
    expect(rupees(150_000)).toBe("1500.00");
    expect(rupees("1234567")).toBe("12345.67");
    expect(rupees(-5)).toBe("-0.05");
    expect(rupees(null)).toBeNull();
  });

  it("zips each CSV under its own name", async () => {
    const zip = await zipCsvs({ leads: "a,b\r\n", clients: "₹ ok\r\n" });
    expect(unzip(zip)).toEqual({ "leads.csv": "a,b\r\n", "clients.csv": "₹ ok\r\n" });
  });
});
