import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatLocalDateTime, toLocalInputValue } from "@/lib/datetime";
import type { FlattenedDamagePhoto, FlattenedPhoto } from "@/lib/flatten-photo";
import type { ClaimPackData, PackDamagePhoto, PackOtherPhoto } from "@/lib/pack-data";

// SPEC F9 step 3: the PDF content, in the order listed there. Loaded only via
// a dynamic import from the pack page, so @react-pdf/renderer (a large
// dependency) never lands in the first page bundle.
export interface ClaimPackPdfImages {
  damagePhotos: Record<string, FlattenedDamagePhoto>; // keyed by photoId
  otherPhotos: Record<string, FlattenedPhoto>; // keyed by photoId
}

const FOOTER_NOTE = "Prepared by the claimant using Ajali Kit. AI marks are a guide, not an assessment.";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#0b1f3a", fontFamily: "Helvetica" },
  coverTitle: { fontSize: 20, fontWeight: 700, marginBottom: 16, marginTop: 120 },
  coverRow: { marginBottom: 6 },
  coverLabel: { fontSize: 9, color: "#64748b" },
  coverValue: { fontSize: 12 },
  h1: { fontSize: 14, fontWeight: 700, marginBottom: 10 },
  h2: { fontSize: 11, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  box: { borderWidth: 1, borderColor: "#d8dce3", borderRadius: 4, padding: 10, marginBottom: 10 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 130, color: "#64748b" },
  value: { flex: 1 },
  paragraph: { lineHeight: 1.5, marginBottom: 6 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eceff3", paddingVertical: 4 },
  tableHeaderRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#0b1f3a", paddingBottom: 4, fontWeight: 700 },
  tableCellVehicle: { width: 50 },
  tableCellPart: { width: 110 },
  tableCellType: { width: 90 },
  tableCellSeverity: { width: 70 },
  tableCellRef: { flex: 1 },
  checklistRow: { flexDirection: "row", marginBottom: 4, gap: 6 },
  checklistMark: { width: 16 },
  photoPair: { flexDirection: "row", gap: 8, marginBottom: 4 },
  photoHalf: { flex: 1 },
  photoCaption: { fontSize: 8, color: "#64748b", marginTop: 3 },
  otherPhotoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  otherPhotoCell: { width: "47%" },
  footer: { position: "absolute", bottom: 16, left: 32, right: 32, fontSize: 7, color: "#8a93a3", flexDirection: "row", justifyContent: "space-between" },
});

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>{FOOTER_NOTE}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function fit(width: number, height: number, maxWidth: number): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  const scale = maxWidth / width;
  return { width: maxWidth, height: Math.round(height * scale) };
}

export function ClaimPackPdfDocument({ data, images }: { data: ClaimPackData; images: ClaimPackPdfImages }) {
  const injured = data.anyoneInjured === null ? "Not answered" : data.anyoneInjured ? "Yes" : "No";
  const vehiclesInvolved = 1 + (data.otherPartyInvolved === "yes" ? Math.max(data.otherParties.length, 1) : 0);
  const otherPhotoPairs = chunk(data.otherPhotos, 2);

  return (
    <Document title={`Motor accident claim pack, ${data.reference}`}>
      {/* Cover (F9 item 1) */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.coverTitle}>Motor Accident Claim Pack</Text>
        <CoverRow label="Incident date" value={formatLocalDateTime(data.occurredAtLocal)} />
        <CoverRow label="Place" value={data.locationText || "Not recorded"} />
        <CoverRow label="Own vehicle registration" value={data.ownRegistration || "Not recorded"} />
        {data.claimantName ? <CoverRow label="Claimant" value={data.claimantName} /> : null}
        <CoverRow label="Generated" value={formatLocalDateTime(toLocalInputValue(data.generatedAt))} />
        <CoverRow label="Ajali Kit reference" value={data.reference} />
        <Footer />
      </Page>

      {/* Summary, incident details, account and declaration (F9 items 2 to 4) */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Summary</Text>
        <View style={styles.box}>
          <Row label="Vehicles involved" value={String(vehiclesInvolved)} />
          <Row label="Anyone injured" value={injured} />
          <Row label="Police OB number" value={data.police.obNumber || "Not yet on file"} />
          <Row label="Outstanding items" value={data.outstandingLabels.length ? data.outstandingLabels.join(", ") : "None"} />
        </View>

        <Text style={styles.h2}>Incident details</Text>
        <View style={styles.box}>
          <Row label="Time" value={formatLocalDateTime(data.occurredAtLocal)} />
          <Row
            label="Location"
            value={
              data.locationText +
              (data.locationCoords ? ` (${data.locationCoords.lat.toFixed(5)}, ${data.locationCoords.lng.toFixed(5)})` : "")
            }
          />
          <Row label="Weather" value={data.weather ?? "Not recorded"} />
          <Row label="Road" value={data.road.length ? data.road.join(", ") : "Not recorded"} />
        </View>

        <Text style={styles.h2}>Claimant&apos;s account</Text>
        <View style={styles.box}>
          <Text style={styles.paragraph}>{data.accountText || "Not provided."}</Text>
        </View>

        <Text style={styles.h2}>Declaration</Text>
        <View style={styles.box}>
          <Text style={styles.paragraph}>I confirm this account is true to the best of my knowledge.</Text>
          <Row label="Name" value={data.claimantName || "Not recorded"} />
          <Row label="Date" value={data.accountConfirmedAt ? formatLocalDateTime(toLocalInputValue(data.accountConfirmedAt)) : "Not confirmed"} />
        </View>
        <Footer />
      </Page>

      {/* Damage schedule (F9 item 5) */}
      {data.damageSchedule.length > 0 ? (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Damage schedule</Text>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.tableCellVehicle}>Vehicle</Text>
            <Text style={styles.tableCellPart}>Part</Text>
            <Text style={styles.tableCellType}>Damage type</Text>
            <Text style={styles.tableCellSeverity}>Severity</Text>
            <Text style={styles.tableCellRef}>Photo ref</Text>
          </View>
          {data.damageSchedule.map((row, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.tableCellVehicle}>{row.vehicle === "own" ? "Own" : "Other"}</Text>
              <Text style={styles.tableCellPart}>{row.part}</Text>
              <Text style={styles.tableCellType}>{row.damageType.replace("_", " ")}</Text>
              <Text style={styles.tableCellSeverity}>{row.severity}</Text>
              <Text style={styles.tableCellRef}>{row.photoRef}</Text>
            </View>
          ))}
          <Text style={[styles.photoCaption, { marginTop: 8 }]}>Severity is indicative only, not a cost or fault assessment.</Text>
          <Footer />
        </Page>
      ) : null}

      {/* Annotated damage photos (F9 item 6) */}
      {data.damagePhotos.map((photo) => (
        <DamagePhotoPage key={photo.photoId} photo={photo} image={images.damagePhotos[photo.photoId]} />
      ))}

      {/* Other photos, 2 per page (F9 item 7) */}
      {otherPhotoPairs.map((pair, pageIndex) => (
        <Page size="A4" style={styles.page} key={pageIndex}>
          <Text style={styles.h1}>{pageIndex === 0 ? "Other photos" : "Other photos (continued)"}</Text>
          <View style={styles.otherPhotoGrid}>
            {pair.map((photo) => (
              <OtherPhotoCell key={photo.photoId} photo={photo} image={images.otherPhotos[photo.photoId]} />
            ))}
          </View>
          <Footer />
        </Page>
      ))}

      {/* Other party details (F9 item 8) */}
      {data.otherPartyInvolved === "yes" ? (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Other party details</Text>
          {data.otherParties.length === 0 ? (
            <Text style={styles.paragraph}>No other party details were recorded.</Text>
          ) : (
            data.otherParties.map((party, index) => (
              <View key={index} style={styles.box}>
                <Text style={[styles.h2, { marginTop: 0 }]}>Vehicle {index + 1}</Text>
                {party.refusedToShare ? <Text style={styles.paragraph}>The other driver declined to share their details.</Text> : null}
                <Row label="Driver" value={party.driverName} />
                <Row label="Driver phone" value={party.driverPhone} />
                <Row label="Licence number" value={party.licenceNumber} />
                <Row label="Vehicle registration" value={party.vehicleRegistration} />
                <Row label="Vehicle make/model" value={[party.vehicleMake, party.vehicleModel].filter(Boolean).join(" ")} />
                <Row label="Owner" value={party.ownerName} />
                <Row label="Insurer" value={party.insurer} />
                <Row label="Policy/certificate no" value={party.policyOrCertificateNo} />
                {party.notes ? <Row label="Notes" value={party.notes} /> : null}
              </View>
            ))
          )}
          <Footer />
        </Page>
      ) : null}

      {/* Police report (F9 item 9) */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Police report</Text>
        <View style={styles.box}>
          <Row label="Station" value={data.police.station} />
          <Row label="OB number" value={data.police.obNumber} />
          <Row label="Date reported" value={data.police.reportedAt} />
          <Row label="Officer" value={data.police.officerName} />
          <Row label="Abstract obtained" value={data.police.abstractObtained ? "Yes" : "Not yet"} />
        </View>

        {/* Witnesses (F9 item 10) */}
        <Text style={styles.h1}>Witnesses</Text>
        {data.witnessesPresent !== "yes" || data.witnesses.length === 0 ? (
          <Text style={styles.paragraph}>No witnesses recorded.</Text>
        ) : (
          data.witnesses.map((witness, index) => (
            <View key={index} style={styles.box}>
              <Row label="Name" value={witness.name} />
              {witness.phone ? <Row label="Phone" value={witness.phone} /> : null}
              <Text style={styles.paragraph}>{witness.statement}</Text>
            </View>
          ))
        )}

        {/* Document checklist (F9 item 11) */}
        <Text style={styles.h1}>Documents the insurer may ask for</Text>
        {[...data.requiredItems, ...data.checklist].map((item) => (
          <View key={item.key} style={styles.checklistRow}>
            <Text style={styles.checklistMark}>{item.met ? "[x]" : "[ ]"}</Text>
            <Text>{item.label}</Text>
          </View>
        ))}
        <Footer />
      </Page>
    </Document>
  );
}

function DamagePhotoPage({ photo, image }: { photo: PackDamagePhoto; image: FlattenedDamagePhoto | undefined }) {
  const overlaySize = image ? fit(image.overlay.width, image.overlay.height, 240) : null;
  const originalSize = image ? fit(image.original.width, image.original.height, 240) : null;
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>
        Damage photo, {photo.vehicle === "own" ? "own vehicle" : "other vehicle"} ({photo.photoRef})
      </Text>
      {image && overlaySize && originalSize ? (
        <View style={styles.photoPair}>
          <View style={styles.photoHalf}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image is a PDF primitive with no alt prop, not an HTML img */}
            <Image src={image.overlay.dataUrl} style={{ width: overlaySize.width, height: overlaySize.height }} />
            <Text style={styles.photoCaption}>Annotated</Text>
          </View>
          <View style={styles.photoHalf}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image is a PDF primitive with no alt prop, not an HTML img */}
            <Image src={image.original.dataUrl} style={{ width: originalSize.width, height: originalSize.height }} />
            <Text style={styles.photoCaption}>Original</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.paragraph}>Photo not available.</Text>
      )}
      <Text style={styles.photoCaption}>
        Captured {formatLocalDateTime(toLocalInputValue(photo.takenAt))}, {photo.photoRef}
      </Text>
      <View style={{ marginTop: 10 }}>
        {photo.items.map(({ item, colorIndex }) => (
          <Text key={item.id} style={{ marginBottom: 3 }}>
            {colorIndex + 1}. {item.part}, {item.damageType.replace("_", " ")}, {item.severity}
          </Text>
        ))}
      </View>
      <Footer />
    </Page>
  );
}

function OtherPhotoCell({ photo, image }: { photo: PackOtherPhoto; image: FlattenedPhoto | undefined }) {
  const size = image ? fit(image.width, image.height, 230) : null;
  return (
    <View style={styles.otherPhotoCell}>
      {image && size ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image is a PDF primitive with no alt prop, not an HTML img
        <Image src={image.dataUrl} style={{ width: size.width, height: size.height }} />
      ) : (
        <Text>Photo not available.</Text>
      )}
      <Text style={styles.photoCaption}>Captured {formatLocalDateTime(toLocalInputValue(photo.takenAt))}</Text>
    </View>
  );
}

function CoverRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.coverRow}>
      <Text style={styles.coverLabel}>{label}</Text>
      <Text style={styles.coverValue}>{value}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}
