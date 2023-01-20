import Head from "next/head";
import { useState } from "react";

export default function Home() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const request = () => {
    if (username == "" || password == "") return;
    fetch("/api/getCourses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: username,
        password: password,
      }),
    })
      .then((res) => {
        res
          .json()
          .then((result) => {
            result = result.response;
            console.log("res:", result);
          })
          .catch((err) => {
            throw err;
          });
      })
      .catch((err) => {
        console.log("error:", err);
      });
  };

  return (
    <>
      <Head>
        <title>TA Api</title>
        <meta name="description" content="API for retrieving TA data" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main>
        <input
          type="text"
          placeholder="Username"
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={request}>Get</button>
      </main>
    </>
  );
}
