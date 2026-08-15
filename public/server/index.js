export default {
  async fetch(request, environment) {
    const assets = environment?.ASSETS;
    if (!assets || typeof assets.fetch !== "function") {
      return new Response("Static asset binding is unavailable.", { status: 503 });
    }
    return assets.fetch(request);
  },
};
