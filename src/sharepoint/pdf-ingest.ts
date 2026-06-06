import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { calculateHASH, calculateUUID, PartialJurisprudenciaDocument } from "@stjiris/jurisprudencia-document";
import { FilesystemUpdate, logDocumentProcessingError, writeFilesystemUpdate } from "@stjiris/filesystem-lib";
import { client as esClient, updateJurisDocument } from "../juris.js";
import { JurisprudenciaVersion } from "@stjiris/jurisprudencia-document";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const tenantId = envOrFail("TENANT_ID");
const clientId = envOrFail("CLIENT_ID");
const clientSecret = envOrFail("CLIENT_SECRET");
const siteId = envOrFail("SITE_ID");
const pdfDriveName = envOrFail("PDF_DRIVE");
const pdfFolder = process.env.PDF_FOLDER || "PDF";
const etlSecret = envOrFail("ETL_SECRET");
const jurisUrl = envOrFail("JURIS_URL");
const basePath = process.env.NEXT_BASE_PATH || "";

const graphClient = Client.initWithMiddleware({
    authProvider: new TokenCredentialAuthenticationProvider(
        new ClientSecretCredential(tenantId, clientId, clientSecret),
        { scopes: ["https://graph.microsoft.com/.default"] }
    ),
});

function envOrFail(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing environment variable ${name}`);
    return value;
}

async function getDriveId(): Promise<string> {
    const result = await graphClient.api(`/sites/${siteId}/drives`).select("id,name").get();
    const drive = result.value.find((d: any) => d.name === pdfDriveName);
    if (!drive) throw new Error(`Drive '${pdfDriveName}' not found`);
    return drive.id;
}

async function listPdfFiles(driveId: string): Promise<any[]> {
    const items: any[] = [];
    let url = `/drives/${driveId}/root:/${pdfFolder}:/children`;

    while (url) {
        const page = await graphClient.api(url).get();
        for (const item of page.value) {
            if (item.file && item.name.toLowerCase().endsWith(".pdf")) {
                items.push(item);
            }
        }
        url = page["@odata.nextLink"]
            ? page["@odata.nextLink"].replace(/^https?:\/\/graph\.microsoft\.com(\/v1\.0|\/beta)?/, "")
            : null;
    }

    return items;
}

async function downloadFile(driveId: string, itemId: string): Promise<Buffer> {
    const stream = await graphClient.api(`/drives/${driveId}/items/${itemId}/content`).get();
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    return Buffer.concat(chunks.map(c => Buffer.from(c)));
}

function createDocFromFilename(filename: string): PartialJurisprudenciaDocument {
    const processo = path.basename(filename, path.extname(filename)).replace(/-/g, "/");

    const doc: PartialJurisprudenciaDocument = {
        "Número de Processo": processo,
        "Fonte": "STJ (Sharepoint)",
        "STATE": "importação",
        "Original": { "Fonte": "STJ (Sharepoint)", "Número de Processo": processo },
        "CONTENT": [],
        "Texto": "",
        "Sumário": "",
    };

    doc.HASH = calculateHASH(doc as any);
    doc.UUID = calculateUUID(doc.HASH);

    return doc;
}

async function uploadPdfToJuris(esId: string, uuid: string, pdfBuffer: Buffer, filename: string): Promise<void> {
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" });
    const formData = new FormData();
    formData.append("id", esId);
    formData.append("uuid", uuid);
    formData.append("pdf", blob, filename);

    const res = await fetch(`${jurisUrl}${basePath}/api/pdf/upload`, {
        method: "POST",
        headers: { "x-service-secret": etlSecret },
        body: formData,
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Upload failed (${res.status}): ${body}`);
    }
}

async function processItem(driveId: string, item: any, update: FilesystemUpdate): Promise<void> {
    const doc = createDocFromFilename(item.name);
    console.log(`Processing: ${item.name} → Processo: ${doc["Número de Processo"]}, UUID: ${doc.UUID}`);

    const exists = await esClient.exists({ index: JurisprudenciaVersion, id: doc.UUID! }).catch(() => false);
    if (exists) {
        console.log(`  → Skipped (already in ES)`);
        return;
    }

    const result = await updateJurisDocument(doc);
    if (!result) {
        console.log(`  → Skipped (no UUID)`);
        return;
    }

    console.log(`  → ES ${result.result}: ${result._id}`);

    const pdfBuffer = await downloadFile(driveId, item.id);
    await uploadPdfToJuris(result._id, doc.UUID!, pdfBuffer, item.name);
    console.log(`  → PDF uploaded`);

    update.created_num = (update.created_num || 0) + 1;
    if (!update.created) update.created = [];
    update.created.push(item.name);
}

async function main() {
    console.log(`PDF Ingest: drive='${pdfDriveName}', folder='${pdfFolder}'`);

    const driveId = await getDriveId();
    const items = await listPdfFiles(driveId);
    console.log(`Found ${items.length} PDF files`);

    const update: FilesystemUpdate = {
        updateSource: "STJ (Sharepoint)",
        date_start: new Date(),
        file_errors: [],
    };

    for (const item of items) {
        try {
            await processItem(driveId, item, update);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`  Error: ${msg}`);
            logDocumentProcessingError(update, `${item.name}: ${msg}`);
        }
    }

    update.date_end = new Date();
    writeFilesystemUpdate(update, "STJ (Sharepoint)");
    console.log(`Done. Created: ${update.created_num || 0}, Errors: ${update.file_errors.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
