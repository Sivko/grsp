import { useNavigate } from "react-router-dom";
import { Button, Layout } from "antd";

const { Content } = Layout;

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <Layout style={{ minHeight: "100vh", padding: 24 }}>
      <Content
        style={{
          maxWidth: 560,
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Button type="primary" size="large" onClick={() => navigate("/create")}>
          Создать
        </Button>
        <Button size="large" onClick={() => navigate("/join")}>
          Присоединиться
        </Button>
      </Content>
    </Layout>
  );
}
