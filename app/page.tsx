import { StorePage } from "@/components/store/store-page";
import { getCatalog } from "@/lib/server/dal/catalog";

export default async function Home() {
  return <StorePage catalog={await getCatalog()} />;
}
