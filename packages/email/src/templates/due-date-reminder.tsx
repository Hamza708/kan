import { Body } from "@react-email/body";
import { Button } from "@react-email/button";
import { Container } from "@react-email/container";
import { Head } from "@react-email/head";
import { Heading } from "@react-email/heading";
import { Hr } from "@react-email/hr";
import { Html } from "@react-email/html";
import { Preview } from "@react-email/preview";
import { Text } from "@react-email/text";
import * as React from "react";

export const DueDateReminderTemplate = ({
  cardTitle,
  boardName,
  dueDate,
  cardUrl,
}: {
  cardTitle: string;
  boardName: string;
  dueDate: string;
  cardUrl: string;
}) => (
  <Html>
    <Head />
    <Preview>
      Reminder: {cardTitle} is due on {dueDate}
    </Preview>
    <Body style={{ backgroundColor: "white" }}>
      <Container
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
          margin: "auto",
          paddingLeft: "0.75rem",
          paddingRight: "0.75rem",
        }}
      >
        <Heading
          style={{
            marginTop: "2.5rem",
            marginBottom: "2.5rem",
            fontSize: "24px",
            fontWeight: "bold",
            color: "#232323",
          }}
        >
          workos
        </Heading>
        <Heading
          style={{ fontSize: "24px", fontWeight: "bold", color: "#232323" }}
        >
          Due date reminder
        </Heading>
        <Text
          style={{
            fontSize: "0.875rem",
            marginBottom: "1rem",
            color: "#232323",
          }}
        >
          The card <strong>{cardTitle}</strong> in the board{" "}
          <strong>{boardName}</strong> is due on <strong>{dueDate}</strong>.
        </Text>
        <Button
          target="_blank"
          href={cardUrl}
          style={{
            marginBottom: "2rem",
            borderRadius: "0.375rem",
            backgroundColor: "#282828",
            paddingLeft: "1.5rem",
            paddingRight: "1.5rem",
            paddingTop: "1rem",
            paddingBottom: "1rem",
            fontSize: "0.875rem",
            fontWeight: "500",
            lineHeight: "1",
            color: "white",
          }}
        >
          View Card
        </Button>
        <Hr
          style={{
            marginTop: "2.5rem",
            marginBottom: "2rem",
            borderWidth: "1px",
          }}
        />
        <Text style={{ color: "#7e7e7e" }}>
          Developed by Marketaspex Technology Team.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default DueDateReminderTemplate;
