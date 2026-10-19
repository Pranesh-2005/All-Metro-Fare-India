import { describe, expect, it } from "vitest";
import { ticketMessage, whatsappLink } from "./whatsapp";

describe("whatsapp links", () => {
  it("keeps digits only, so a formatted number still resolves", () => {
    expect(whatsappLink("+91 96508 55800")).toBe("https://wa.me/919650855800");
  });

  it("prefills the trip so the traveller only confirms", () => {
    const message = ticketMessage({
      city: "Delhi NCR",
      from: "Rajiv Chowk",
      to: "Hauz Khas",
      fare: "₹21",
    });
    expect(message).toBe(
      "Hi, I want to book a metro ticket in Delhi NCR from Rajiv Chowk to Hauz Khas. Fare ₹21.",
    );
    expect(whatsappLink("919650855800", message)).toBe(
      `https://wa.me/919650855800?text=${encodeURIComponent(message)}`,
    );
  });
});
