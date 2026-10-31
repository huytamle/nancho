import { Delivery } from "@/components/delivery";
import { Footer } from "@/components/footer";
import { Gallery } from "@/components/gallery";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { MenuSection } from "@/components/menu-section";
import { Reservation } from "@/components/reservation";
import { Visit } from "@/components/visit";

export default function Home() {
  return (
    <>
      <Header />
      <main id="noi-dung">
        <Hero />
        <MenuSection />
        <Delivery />
        <Gallery />
        <Visit />
        <Reservation />
      </main>
      <Footer />
    </>
  );
}
