import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

import { App } from "@/client/app/app";

test("introduces the local player application", () => {
  render(<App />);

  expect(
    screen.getByRole("main", { name: "Wave Player Next" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Wave Player Next" }),
  ).toBeInTheDocument();
});
