import { Calculator } from "@/components/calculator";
import { loadCities } from "@/lib/data";

export default async function Home() {
  const cities = await loadCities();

  return (
    <main className="min-h-screen">
      <Calculator cities={cities} />
    </main>
  );
}
