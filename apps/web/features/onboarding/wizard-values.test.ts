import { finalizeBody, fromDraftData, problemsFor, stepOf, toDraftData } from "./wizard-values";

describe("onboarding wizard values", () => {
  it("round-trips a draft and drops empty values", () => {
    const values = fromDraftData({
      fullName: "Asha",
      weight: 72.5,
      secondaryGoals: ["get_stronger"],
    });
    expect(values.weight).toBe("72.5");
    expect(values.email).toBe("");
    expect(toDraftData(values)).toEqual({
      fullName: "Asha",
      weight: 72.5,
      secondaryGoals: ["get_stronger"],
      consentDataProcessing: false,
      consentProgressPhotos: false,
    });
  });

  it("keeps a half-typed draft but drops a field that can't be stored", () => {
    const values = fromDraftData({ fullName: "Asha" });
    values.email = "asha@";
    values.weight = "abc";
    values.limitations = "x".repeat(1200);
    const draft = toDraftData(values);
    expect(draft.email).toBe("asha@");
    expect(draft.weight).toBeUndefined();
    expect(draft.limitations).toBeUndefined();
    expect(draft.fullName).toBe("Asha");
  });

  it("checks only the current step, with the shared schema", () => {
    const values = fromDraftData({});
    expect(problemsFor(values, 1)).toEqual({ fullName: "Enter a name" });
    expect(Object.keys(problemsFor(values, 2)).sort()).toEqual(["primaryGoal", "trainingMode"]);
    expect(problemsFor(values, 3)).toEqual({
      consentDataProcessing: "The client's consent to data processing is required",
    });
    values.weight = "-3";
    expect(problemsFor(values, 3).weight).toBe("Enter a positive number");
  });

  it("knows each field's step and builds the Create body", () => {
    expect(stepOf("trainingMode")).toBe(2);
    expect(stepOf("body_fat")).toBe(3);
    const values = fromDraftData({
      fullName: "Asha",
      primaryGoal: "build_muscle",
      trainingMode: "online",
      consentDataProcessing: true,
      height: 170,
    });
    expect(problemsFor(values)).toEqual({});
    expect(
      finalizeBody(values, { draftId: undefined, units: { weightUnit: "kg", lengthUnit: "cm" } }),
    ).toMatchObject({
      fullName: "Asha",
      height: 170,
      consentDataProcessing: true,
      units: { weightUnit: "kg" },
    });
  });
});
