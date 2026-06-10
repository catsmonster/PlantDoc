function App() {
  return (
    <div className="min-h-dvh bg-leaf-50 text-slate-800">
      <header className="bg-leaf-700 px-4 py-5 text-white">
        <h1 className="text-xl font-semibold tracking-tight">PlantDoc</h1>
        <p className="mt-1 text-sm text-leaf-100">
          Track houseplant care, health, and environment outcomes.
        </p>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">
        <section className="rounded-xl border border-leaf-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-leaf-600">
            Project status
          </h2>
          <p className="mt-2 text-sm leading-relaxed">
            Phase 0 foundation: schema automation, privacy boundaries, and seed
            data are in place. The mobile-first logging app arrives in Phase 1.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
