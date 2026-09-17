export function stitchingSteps(category: string): string[] {
  const prepare =
    "Verify approved measurements, size ratio, grain direction and seam allowances. Make and approve one fit sample before bulk work.";
  const finish =
    "Trim threads, press, check measurements and seam strength, attach size labels, count and submit for admin quality review.";
  if (category === "Shirts" || category === "Uniforms")
    return [
      prepare,
      "Fuse collars, cuffs and plackets as specified. Stabilize pocket openings.",
      "Prepare pockets and front plackets; attach pockets before joining body panels.",
      "Join yoke and shoulder seams. Construct and attach collar and collar stand.",
      "Prepare sleeve plackets; set sleeves and close side and underarm seams.",
      "Attach cuffs, finish hem, work buttonholes and attach buttons to approved placement.",
      finish,
    ];
  if (category === "Trousers")
    return [
      prepare,
      "Prepare pocket bags, facings and fly components; apply interfacing where specified.",
      "Sew front and back pockets, darts and yokes. Assemble fly and zipper.",
      "Join rise, inseam and outseam in the approved construction sequence.",
      "Assemble waistband and belt loops, attach waistband and secure closure.",
      "Check waist, hip, rise and inseam; finish hems to the approved length.",
      finish,
    ];
  if (category === "Dresses" || category === "Womenswear")
    return [
      prepare,
      "Stabilize neckline, armholes and closure edges; prepare facings or lining.",
      "Sew darts, tucks or gathers; assemble bodice and skirt panels as specified.",
      "Join shoulders and side seams; attach sleeves or finish armholes.",
      "Join waist seam if present, install zipper / buttons and attach facing or lining.",
      "Check drape and symmetry on the approved form; finish neckline, sleeve and lower hems.",
      finish,
    ];
  return [
    prepare,
    "Prepare trims, interfacing, pockets and subassemblies per the approved technical specification.",
    "Assemble major panels and check intermediate measurements.",
    "Apply closures, facings, lining and finishing operations as specified.",
    finish,
  ];
}
