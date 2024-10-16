// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import * as cheerio from "cheerio";
import Cors from "cors";
//@ts-ignore
import { fetch as cookieFetch, CookieJar } from "node-fetch-cookies";

type Data = {
  response: any;
};

const cors = Cors({
  methods: ["POST"],
});
export const config = {
  api: {
    externalResolver: true,
  },
}

function runMiddleware(req: any, res: any, fn: any) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }

      return resolve(result);
    });
  });
}

function parseOverallMark(mark: string) {
  mark = mark.replaceAll(" ", "");
  const result: any = {
    mark: "N/A",
    isFinal: false,
    isMidterm: false,
  };

  if (mark.includes("FINAL")) {
    result.mark = parseFloat(mark.split("FINALMARK:")[1].split("%")[0]);
    result.isFinal = true;
  } else if (mark.includes("currentmark")) {
    result.mark = parseFloat(mark.split("currentmark=")[1].split("%")[0]);
  } else if (mark.includes("MIDTERM")) {
    result.mark = parseFloat(mark.split("MIDTERMMARK:")[1].split("%")[0]);
    result.isMidterm = true;
  }
  return result;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  console.time("API Response Time");
  runMiddleware(req, res, cors);

  const username = req.body.username;
  const password = req.body.password;

  const cookieJar = new CookieJar();

  //check if username and password are valid
  if (!username || !password) {
    res.status(400).json({
      response: { error: "Invalid username or password" },
    });
    return;
  }
  if (req.method === "POST") {
    cookieFetch(
      cookieJar,
      `https://ta.yrdsb.ca/live/index.php?username=${username}&password=${password}&submit=Login&subject_id=0`,
      {
        method: "POST",
        body: "credentials",
      }
    )
      .then((data: any) => {
        data
          .text()
          .then((data: any) => {
            // check if login is valid
            if (data.includes("Invalid Login")) {
              res.status(401).json({
                response: { error: "Invalid Login" },
              });
              return;
            } else if (data.includes("Access Denied")) {
              res.status(403).json({
                response: { error: "Access Denied" },
              });
              return;
            } else if (data.includes("Session Expired")) {
              res.status(401).json({
                response: { error: "Session Expired" },
              });
              return;
            }

            //parse html
            const $ = cheerio.load(data);
            let courses: any = [];
            $(".green_border_message div table tr").each(
              (i: any, elem: any) => {
                try {
                  const link = $(elem).find("a").attr("href");
                  let course = $(elem).text().split("\n");
                  // trim whitespace
                  if (!course[1].includes("Course Name")) {
                    let filteredCourse = [];
                    for (let i = 0; i < course.length; i++) {
                      course[i] = course[i].trim();
                      if (course[i].length > 0) {
                        filteredCourse.push(course[i]);
                      }
                    }

                    if (filteredCourse.length > 3) {
                      const overall: any = {
                        mark: "N/A",
                        isFinal: false,
                        isMidterm: false,
                      };
                      if (
                        filteredCourse[4] &&
                        !filteredCourse[3].includes("Dropped")
                      ) {
                        let mark = filteredCourse[4]
                          ?.trim()
                          .replaceAll(" ", "");
                        if (mark.includes("FINAL")) {
                          overall.mark = parseFloat(
                            mark.split("FINALMARK:")[1].split("%")[0]
                          );
                          overall.isFinal = true;
                        } else if (mark.includes("currentmark")) {
                          overall.mark = parseFloat(
                            mark.split("currentmark=")[1].split("%")[0]
                          );
                        } else if (mark.includes("MIDTERM")) {
                          overall.mark = parseFloat(
                            mark.split("MIDTERMMARK:")[1].split("%")[0]
                          );
                          overall.isMidterm = true;
                        }
                      }

                      let end_time = "";
                      let dropped_time = "";
                      if (filteredCourse[3].includes("Dropped on")) {
                        end_time = filteredCourse[3].split("Dropped")[0].trim();
                        dropped_time = filteredCourse[3]
                          .split("Dropped on")[1]
                          .trim();
                      } else {
                        end_time = filteredCourse[3].trim();
                      }
                      const jsonCourse = {
                        code:
                          filteredCourse[0].split(" : ")[0] || "Unknown Code",
                        name:
                          filteredCourse[0].split(" : ")[1] || "Unknown Course",
                        block:
                          filteredCourse[1]
                            .replace("Block: P", "")
                            .split(" ")[0] || "N/A",
                        room:
                          filteredCourse[1].split("rm. ")[1] || "Unknown Room",
                        start_time: filteredCourse[2].split(" ")[0] || "",
                        end_time: end_time,
                        dropped_time: dropped_time,
                        overall_mark: overall.mark || "N/A",
                        isFinal: overall.isFinal,
                        isMidterm: overall.isMidterm,
                        link: link,
                      };
                      courses.push(jsonCourse);
                    }
                  }
                } catch (err) {
                  console.log(err);
                }
              }
            );

            //recurse through courses to get data
            let i = 0;
            function getCourseData() {
              if (i < courses.length) {
                cookieFetch(
                  cookieJar,
                  "https://ta.yrdsb.ca/live/students/" + courses[i].link,
                  {
                    method: "POST",
                    body: "credentials",
                  }
                )
                  .then((res: any) => {
                    res
                      .text()
                      .then((res: any) => {
                        if (res.includes("Invalid Login")) {
                          res.status(401).json({
                            response: { error: "Invalid Login" },
                          });
                          return;
                        } else if (res.includes("Access Denied")) {
                          res.status(403).json({
                            response: { error: "Access Denied" },
                          });
                          return;
                        } else if (res.includes("Session Expired")) {
                          res.status(401).json({
                            response: { error: "Session Expired" },
                          });
                          return;
                        }
                        const $ = cheerio.load(res);

                        //assignments
                        let assignments: any = [];
                        let counter = 1;
                        $('table[width="100%"]')
                          .children()
                          .children()
                          .each((i: any, elem: any) => {
                            counter++;
                            if (counter % 2 === 0) {
                              if (counter > 2) {
                                assignments[assignments.length - 1].feedback =
                                  $(elem).text().trim();
                              }
                              return;
                            }

                            let assignment: any = {};
                            assignment.name = $(elem)
                              .find('td[rowspan="2"]')
                              .text()
                              .replaceAll("\t", "");
                            [
                              ["KU", "ffffaa"],
                              ["A", "ffd490"],
                              ["T", "c0fea4"],
                              ["C", "afafff"],
                              ["O", "eeeeee"],
                              ["F", "#dedede"],
                            ].forEach((item) => {
                              const category = $(elem)
                                .find(`td[bgcolor="${item[1]}"]`)
                                .text()
                                .replaceAll("\t", "")
                                .trim();
                              if (category) {
                                try {
                                  assignment[item[0]] = [
                                    {
                                      get: parseFloat(category.split(" / ")[0]),
                                      total: parseFloat(
                                        category.split(" / ")[1].split(" = ")[0]
                                      ),
                                      weight: parseFloat(
                                        category
                                          .split("weight=")[1]
                                          .split("\n")[0]
                                      ),
                                      finished: !category.includes("finished"),
                                    },
                                  ];
                                } catch (e) {
                                  assignment[item[0]] = [
                                    {
                                      get: 0,
                                      total: 0,
                                      weight: 0,
                                      finished: true,
                                    },
                                  ];
                                }
                              }
                            });
                            assignments.push(assignment);
                          });

                        // weight_table
                        let weight_table: any = {};
                        [
                          ["KU", "ffffaa"],
                          ["A", "ffd490"],
                          ["T", "c0fea4"],
                          ["C", "afafff"],
                          ["O", "eeeeee"],
                          ["F", "cccccc"],
                        ].forEach((item) => {
                          const weights: any = [];

                          $('table[cellpadding="5"]')
                            .find(`tr[bgcolor="#${item[1]}"]`)
                            .children()
                            .each((i: any, elem: any) => {
                              weights.push($(elem).text().trim());
                            });

                          try {
                            let index = 1;
                            if (weights[0].includes("Final")) {
                              index = 0;
                              weights[index] = "0%";
                            }
                            weight_table[item[0]] = {
                              W: parseFloat(weights[index].replace("%", "")),
                              CW: parseFloat(
                                weights[index + 1].replace("%", "")
                              ),
                              SA: parseFloat(
                                weights[index + 2].replace("%", "")
                              ),
                            };
                          } catch (err) {
                            return;
                          }
                        });

                        if (assignments.length === 0) {
                          assignments = [];
                        }

                        if (Object.keys(weight_table).length === 0) {
                          weight_table = {};
                        }

                        courses[i].assignments = [...assignments];
                        courses[i].weight_table = { ...weight_table };

                        i++;
                        getCourseData();
                      })
                      .catch((err: any) => {
                        throw err;
                      });
                  })
                  .catch((err: any) => {
                    throw err;
                  });
              } else {
                res.status(200).json({
                  response: courses,
                });
              }
            }
            getCourseData();
          })
          .catch((err: any) => {
            throw err;
          });
      })
      .catch((err: any) => {
        res.status(500).json({
          response: { error: err },
        });
      });
  }
}
