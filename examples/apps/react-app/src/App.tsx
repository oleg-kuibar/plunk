import { useState } from "react";
import { formatPrice, type Product } from "@example/api-client";
import { renderButton, renderCard } from "@example/ui-kit";

const products: Product[] = [
  { id: "1", name: "Wireless Headphones", price: 79.99, currency: "USD", inStock: true },
  { id: "2", name: "Mechanical Keyboard", price: 149.0, currency: "USD", inStock: true },
  { id: "3", name: "USB-C Hub", price: 39.99, currency: "USD", inStock: false },
];

export function App() {
  const [selected, setSelected] = useState<Product | null>(null);

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 600, margin: "2rem auto" }}>
      <h1>React App with plunk-linked packages</h1>
      <p>
        This app imports from <code>@example/api-client</code> and{" "}
        <code>@example/ui-kit</code>, both linked via plunk.
      </p>

      <h2>Products (types + formatPrice from api-client)</h2>
      <ul>
        {products.map((p) => (
          <li key={p.id} style={{ cursor: "pointer" }} onClick={() => setSelected(p)}>
            {p.name} — <strong>{formatPrice(p)}</strong>
            {!p.inStock && <em> (out of stock)</em>}
          </li>
        ))}
      </ul>

      {selected && (
        <div>
          <h2>Selected product (ui-kit card + button)</h2>
          <div
            dangerouslySetInnerHTML={{
              __html: renderCard({
                title: selected.name,
                body: `Price: ${formatPrice(selected)}`,
                footer: renderButton({
                  label: selected.inStock ? "Add to Cart" : "Sold Out",
                  variant: selected.inStock ? "primary" : "danger",
                  disabled: !selected.inStock,
                }),
              }),
            }}
          />
        </div>
      )}
    </div>
  );
}
