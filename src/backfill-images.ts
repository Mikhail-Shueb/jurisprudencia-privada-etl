import { client } from "./client";
import { JurisprudenciaDocument, JurisprudenciaVersion } from "@stjiris/jurisprudencia-document";
import { updateJurisprudenciaDocumentFromURL, indexJurisprudenciaDocumentFromURL } from "./crud-jurisprudencia-document-from-url";

async function main() {
    const args = process.argv.slice(2);

    // Mode 1: Single URL passed as CLI argument (e.g. for testing a specific DGSI decision)
    if (args.length > 0 && args[0].startsWith("http")) {
        const targetUrl = args[0];
        console.log(`[Backfill] Processing single document from URL: ${targetUrl}`);
        const res = await updateJurisprudenciaDocumentFromURL("", targetUrl).catch(async () => {
            return await indexJurisprudenciaDocumentFromURL(targetUrl);
        });
        console.log("[Backfill] Result:", res);
        return;
    }

    // Mode 2: Query Elasticsearch for documents with existing <img> tags
    console.log(`[Backfill] Searching index ${JurisprudenciaVersion} for documents with orphan <img> tags...`);

    const query = {
        bool: {
            should: [
                { wildcard: { Texto: "*<img*" } },
                { wildcard: { Sumário: "*<img*" } }
            ],
            minimum_should_match: 1
        }
    };

    let countRes = await client.count({
        index: JurisprudenciaVersion,
        query
    }).catch(err => {
        console.error("[Backfill] Error counting documents:", err);
        return { count: 0 };
    });

    console.log(`[Backfill] Found ${countRes.count} documents with image tags.`);
    if (countRes.count === 0) {
        console.log("[Backfill] No documents need backfill. Done.");
        return;
    }

    const scrollSearch = await client.search<JurisprudenciaDocument>({
        index: JurisprudenciaVersion,
        scroll: "5m",
        size: 50,
        _source: ["URL", "UUID", "Número de Processo"],
        query
    });

    let scrollId = scrollSearch._scroll_id;
    let hits: any[] = scrollSearch.hits.hits;
    let processed = 0;
    let errors = 0;

    while (hits && hits.length > 0) {
        for (const hit of hits) {
            const url = hit._source?.URL;
            const proc = hit._source?.["Número de Processo"] || hit._id;
            if (!url) {
                console.warn(`[Backfill] Doc ${hit._id} (${proc}) has no URL, skipping.`);
                continue;
            }

            console.log(`[Backfill] (${processed + 1}/${countRes.count}) Re-ingesting images for: ${proc} -> ${url}`);
            try {
                await updateJurisprudenciaDocumentFromURL(hit._id, url);
                processed++;
            } catch (err) {
                console.error(`[Backfill] Failed doc ${hit._id} (${proc}):`, err);
                errors++;
            }
        }

        if (!scrollId) break;
        const next = await client.scroll({
            scroll_id: scrollId,
            scroll: "5m"
        });
        scrollId = next._scroll_id;
        hits = next.hits.hits;
    }

    if (scrollId) {
        await client.clearScroll({ scroll_id: scrollId }).catch(() => {});
    }

    console.log(`[Backfill] Finished! Successfully updated: ${processed}, Errors: ${errors}.`);
}

main().catch(err => {
    console.error("[Backfill] Unhandled fatal error:", err);
    process.exit(1);
});
