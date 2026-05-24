import { fetchReviews } from "../agent/tools/fetch-reviews.js";

(async () => {
  try {
    const out = await fetchReviews({ limit: 5 });
    console.log("FETCH_OUTPUT_START");
    console.log(out);
    console.log("FETCH_OUTPUT_END");
  } catch (err) {
    console.error("ERROR:", err);
    process.exit(1);
  }
})();
