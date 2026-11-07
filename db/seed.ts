import { getSqlClient } from "../api/queries/connection";
import { ensureLocalUser } from "../api/queries/users";
import { ensureWorkspace } from "../api/queries/workspace";

try {
  const user = await ensureLocalUser();
  await ensureWorkspace(user.id);
  console.log("Исходные данные проверены и при необходимости импортированы.");
} finally {
  getSqlClient().close();
}
